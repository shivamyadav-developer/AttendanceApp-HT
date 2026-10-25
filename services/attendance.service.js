import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const STATUS_CACHE_KEY = 'attendanceStatusCache'; // ✅ NEW — persists cache across JS isolates (headless bg task)

class AttendanceService {
    constructor() {
        this.statusCache = null;        // 'CHECKED_IN' | 'CHECKED_OUT'
        this.statusCacheTime = 0;
        this.STATUS_CACHE_TTL = 30000;  // 30 seconds

        // When the check-in API returns an open session (fresh or ALREADY_CHECKED_IN),
        // we store the open session's checkIn timestamp here.
        // getCurrentStatus uses this to override a stale aggregated history response.
        this.openSessionCheckIn = null; // ISO string | null
        this.cachedEmployeeNumber = null;

        this._hydrated = false; // ✅ NEW — whether this isolate has loaded the persisted cache yet
    }

    // ── ✅ NEW: pull the persisted cache into this isolate (once) ─────────────
    // Every headless background-task invocation gets a fresh AttendanceService
    // instance with empty in-memory state. Without this, the TTL cache below
    // is useless in the background and every tick re-fetches history.
    async hydrateStatusCache() {
        if (this._hydrated) return;
        this._hydrated = true;
        try {
            const raw = await AsyncStorage.getItem(STATUS_CACHE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            this.statusCache = parsed.statusCache ?? null;
            this.statusCacheTime = parsed.statusCacheTime ?? 0;
            this.openSessionCheckIn = parsed.openSessionCheckIn ?? null;
            this.cachedEmployeeNumber = parsed.cachedEmployeeNumber ?? null;
            console.log(`[AttendanceService] Hydrated cache from storage: ${this.statusCache}`);
        } catch (e) {
            console.log('[AttendanceService] Hydrate error (non-fatal):', e);
        }
    }

    async _persist() {
        try {
            await AsyncStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
                statusCache: this.statusCache,
                statusCacheTime: this.statusCacheTime,
                openSessionCheckIn: this.openSessionCheckIn,
                cachedEmployeeNumber: this.cachedEmployeeNumber,
            }));
        } catch (e) {
            console.log('[AttendanceService] Persist error (non-fatal):', e);
        }
    }

    // ── ✅ NEW: single source of truth for "do we have a fresh cached status?" ─
    // Returns the cached status string if valid, or null on miss/stale/mismatch.
    // NEVER hits the API. Safe to call from any isolate (hydrates first).
    async getCachedStatus(employeeNumber) {
        await this.hydrateStatusCache();
        if (
            this.cachedEmployeeNumber === employeeNumber &&
            this.statusCache !== null &&
            (Date.now() - this.statusCacheTime) < this.STATUS_CACHE_TTL
        ) {
            return this.statusCache;
        }
        return null;
    }

    async setStatusCache(employeeNumber, status, openSessionCheckIn = null) {
        this.statusCache = status;
        this.statusCacheTime = Date.now();
        this.cachedEmployeeNumber = employeeNumber;
        if (status === 'CHECKED_IN' && openSessionCheckIn) {
            this.openSessionCheckIn = openSessionCheckIn;
        } else if (status === 'CHECKED_OUT') {
            this.openSessionCheckIn = null;
        }
        console.log(`[AttendanceService] Status cache set: ${status}, openSession: ${openSessionCheckIn}`);
        await this._persist(); // ✅ NEW — awaited so it survives even if the (bg) task ends right after
    }

    async clearStatusCache() {
        this.statusCache = null;
        this.statusCacheTime = 0;
        // NOTE: intentionally keep openSessionCheckIn alive so getCurrentStatus
        // can still use it as a fallback even after the cache TTL expires.
        console.log('[AttendanceService] Status cache cleared');
        await this._persist(); // ✅ NEW
    }

    async clearAll() {
        this.statusCache = null;
        this.statusCacheTime = 0;
        this.openSessionCheckIn = null;
        this.cachedEmployeeNumber = null;
        console.log('[AttendanceService] All cache cleared');
        await this._persist(); // ✅ NEW
    }

    // True if there's an open session whose check-in date is NOT today —
    // i.e. a session the backend never closed (orphaned across a day boundary).
    isOpenSessionStale() {
        if (!this.openSessionCheckIn) return false;
        const today = new Date().toISOString().split('T')[0];
        const sessionDate = new Date(this.openSessionCheckIn).toISOString().split('T')[0];
        return sessionDate !== today;
    }

    async getEmployeeId() {
        try {
            const userData = await AsyncStorage.getItem('userData');
            if (userData) {
                const user = JSON.parse(userData);
                return user.employeeNumber || user._id;
            }
            return null;
        } catch (error) {
            console.error('[AttendanceService] Error getting employee ID:', error);
            return null;
        }
    }

    async checkIn(employeeNumber, lat, lng) {
        try {
            console.log(`[AttendanceService] Checking in ${employeeNumber} at (${lat}, ${lng})`);

            const response = await api.post('/ontrack/attendance/check-in', {
                employeeId: employeeNumber,
                lat: lat.toString(),
                lang: lng.toString(),
            });

            console.log('[AttendanceService] Check-in response:', response);

            const attendance = response.data?.attendance;
            const openCheckIn = attendance?.checkIn || null;

            if (response.data?.action === 'ALREADY_CHECKED_IN') {
                console.log('[AttendanceService] Already checked in — session is OPEN');
                // Store the open session checkIn so getCurrentStatus can use it
                await this.setStatusCache(employeeNumber, "CHECKED_IN", openCheckIn);
                return {
                    success: true,
                    data: response.data,
                    message: 'Already checked in',
                    alreadyCheckedIn: true,
                };
            }

            if (response.success) {
                await this.setStatusCache(employeeNumber, "CHECKED_IN", openCheckIn);
            }

            return {
                success: response.success,
                data: response.data,
                message: response.message,
            };
        } catch (error) {
            console.error('[AttendanceService] Check-in error:', error);
            return {
                success: false,
                message: error.message || 'Check-in failed',
                // No internet / server down — worth trying again later
                retryable: !error.status || error.status >= 500,
            };
        }
    }

    async checkOut(employeeNumber, lat, lng) {
        try {
            console.log(`[AttendanceService] Checking out ${employeeNumber} at (${lat}, ${lng})`);

            const response = await api.post('/ontrack/attendance/check-out', {
                employeeId: employeeNumber,
                lat: lat.toString(),
                lang: lng.toString(),
            });

            console.log('[AttendanceService] Check-out response:', response);

            if (response.success) {
                // Clear open session on checkout
                await this.setStatusCache(employeeNumber, "CHECKED_OUT");
            }

            return {
                success: response.success,
                data: response.data,
                message: response.message,
            };
        } catch (error) {
            console.error('[AttendanceService] Check-out error:', error);
            return {
                success: false,
                message: error.message || 'Check-out failed',
                // No internet / server down — worth trying again later
                retryable: !error.status || error.status >= 500,
            };
        }
    }

    async getAttendanceHistory(employeeNumber) {
        try {
            console.log(`[AttendanceService] Fetching history for ${employeeNumber}`);
            const response = await api.get(`/ontrack/attendance/${employeeNumber}`);
            return {
                success: response.success,
                data: response.data || [],
                message: response.message,
            };
        } catch (error) {
            console.error('[AttendanceService] Get attendance error:', error);
            return {
                success: false,
                data: [],
                message: error.message || 'Failed to fetch attendance',
            };
        }
    }

    async getTodayAttendance(employeeNumber) {
        try {
            const history = await this.getAttendanceHistory(employeeNumber);
            if (history.success && history.data.length > 0) {
                const today = new Date().toISOString().split('T')[0];
                return history.data.find(a => a.date === today) || null;
            }
            return null;
        } catch (error) {
            console.error('[AttendanceService] Get today attendance error:', error);
            return null;
        }
    }

    // ── UPDATED: routes through getCachedStatus (hydrates + checks TTL) ────────
    async getCurrentStatus(employeeNumber) {
        try {
            const cached = await this.getCachedStatus(employeeNumber);
            if (cached !== null) {
                console.log(`[AttendanceService] Status: ${cached} (cached)`);
                return cached;
            }

            // Cache miss/stale — fetch once, then persist so the NEXT tick
            // (even in a different isolate) is a hit.
            const history = await this.getAttendanceHistory(employeeNumber);
            const status = this._deriveStatus(history);
            await this.setStatusCache(employeeNumber, status, this.openSessionCheckIn);
            return status;

        } catch (error) {
            console.error('[AttendanceService] Get current status error:', error);
            return 'UNKNOWN';
        }
    }

    // Derive status from a history response object.
    // Shared by getCurrentStatus and attend.jsx to ensure identical logic.
    _deriveStatus(history) {
        if (!history.success || !history.data?.length) {
            if (this.openSessionCheckIn) {
                console.log('[AttendanceService] Status: CHECKED_IN (open session, no history)');
                return 'CHECKED_IN';
            }
            console.log('[AttendanceService] Status: CHECKED_OUT (no data)');
            return 'CHECKED_OUT';
        }

        const today = new Date().toISOString().split('T')[0];
        const todayRecord = history.data.find(item => item.date === today);

        if (!todayRecord) {
            if (this.openSessionCheckIn) {
                console.log('[AttendanceService] Status: CHECKED_IN (open session, no today record)');
                return 'CHECKED_IN';
            }
            console.log('[AttendanceService] Status: CHECKED_OUT (no today record)');
            return 'CHECKED_OUT';
        }

        console.log('[AttendanceService] Today record:', JSON.stringify(todayRecord));

        // Backend marks the session explicitly OPEN
        if (todayRecord.status === 'OPEN') {
            console.log('[AttendanceService] Status: CHECKED_IN (OPEN)');
            return 'CHECKED_IN';
        }

        // Re-entry: open session is newer than the last aggregated checkout
        if (todayRecord.latestCheckOut && this.openSessionCheckIn) {
            const coTime = new Date(todayRecord.latestCheckOut).getTime();
            const osTime = new Date(this.openSessionCheckIn).getTime();
            if (osTime > coTime) {
                console.log('[AttendanceService] Status: CHECKED_IN (re-entry: openSession newer than lastCheckout)');
                return 'CHECKED_IN';
            }
        }

        // Has a checkIn but no checkout yet — still in office
        if (todayRecord.oldestCheckIn && !todayRecord.latestCheckOut) {
            console.log('[AttendanceService] Status: CHECKED_IN (no checkout yet)');
            return 'CHECKED_IN';
        }

        console.log('[AttendanceService] Status: CHECKED_OUT');
        return 'CHECKED_OUT';
    }

    async getLastSevenDaysAttendance(employeeNumber) {
        try {
            const history = await this.getAttendanceHistory(employeeNumber);
            if (history.success) return history.data.slice(0, 7);
            return [];
        } catch (error) {
            console.error('[AttendanceService] Get last 7 days error:', error);
            return [];
        }
    }

    async getMonthlySummary(employeeNumber, year, month) {
        try {
            const history = await this.getAttendanceHistory(employeeNumber);
            if (history.success) {
                const monthStr = `${year}-${String(month).padStart(2, '0')}`;
                const monthData = history.data.filter(a => a.date.startsWith(monthStr));
                const totalDays = monthData.length;
                const presentDays = monthData.filter(a => a.status === 'Present').length;
                const totalDuration = monthData.reduce((sum, a) => sum + (a.totalDurationMinutes || 0), 0);
                return {
                    totalDays,
                    presentDays,
                    absentDays: totalDays - presentDays,
                    attendancePercentage: totalDays > 0 ? (presentDays / totalDays) * 100 : 0,
                    totalDuration: `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m`,
                    data: monthData,
                };
            }
            return null;
        } catch (error) {
            console.error('[AttendanceService] Get monthly summary error:', error);
            return null;
        }
    }
}

export default new AttendanceService();