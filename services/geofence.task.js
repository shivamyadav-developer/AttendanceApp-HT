// services/geofence.task.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import { MOCK_LOCATION_MESSAGE, checkStoreLocation, isMockLocation } from '../utils/location';
import attendanceService from './attendance.service';
import notificationService from './notification.service';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

const BG_COOLDOWN_MS = 60_000; // 60s between attempts
const MOCK_NOTIFY_COOLDOWN_MS = 5 * 60_000; // don't spam the mock-location warning

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getLastActionTimes() {
    try {
        const raw = await AsyncStorage.getItem('bgTaskCooldowns');
        if (!raw) return { lastCheckIn: 0, lastCheckOut: 0 };
        return JSON.parse(raw);
    } catch { return { lastCheckIn: 0, lastCheckOut: 0 }; }
}

async function setLastActionTimes(times) {
    try {
        await AsyncStorage.setItem('bgTaskCooldowns', JSON.stringify(times));
    } catch { }
}

// ── Persist wasInside across bg firings (module-level vars reset each time) ──
async function getWasInside() {
    try {
        const raw = await AsyncStorage.getItem('bgTaskWasInside');
        if (raw === null) return null; // null = unknown (first run)
        return raw === 'true';
    } catch { return null; }
}

async function setWasInside(value) {
    try {
        await AsyncStorage.setItem('bgTaskWasInside', String(value));
    } catch { }
}

// ── Retry reading userData (fixes "No user" race condition) ──────────────────
async function getUserWithRetry(maxAttempts = 3, delayMs = 500) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const raw = await AsyncStorage.getItem('userData');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.employeeNumber) return parsed;
            }
        } catch (e) {
            console.error(`[BgTask] userData read attempt ${attempt} failed:`, e);
        }
        if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return null;
}

// ── Stale session detection ───────────────────────────────────────────────────
function isSessionStaleFromHistory(historyData) {
    if (!historyData?.length) return false;
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = historyData.find(r => r.date === today);
    if (!todayRecord || todayRecord.latestCheckOut) return false;
    if (todayRecord.oldestCheckIn) {
        const checkInDate = new Date(todayRecord.oldestCheckIn).toISOString().split('T')[0];
        if (checkInDate !== today) {
            console.log(`[BgTask] Stale session: checkIn ${checkInDate} ≠ today ${today}`);
            return true;
        }
    }
    return false;
}

// ── Task definition ───────────────────────────────────────────────────────────

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) { console.error('[BgTask] Error:', error.message); return; }
    if (!data?.locations?.length) return;

    const location = data.locations[0];
    if (!location) return;

    const { latitude, longitude } = location.coords;

    // ── Guard: need a logged-in user (with retry) ─────────────────────────────
    const user = await getUserWithRetry();
    if (!user) {
        console.log('[BgTask] No user → skipping');
        return;
    }
    const { employeeNumber } = user;

    // ── Mock-location guard: no check-in, no check-out, state untouched ──────
    if (isMockLocation(location)) {
        console.warn('[BgTask] Mock location detected → blocking attendance action');
        try {
            await AsyncStorage.setItem('lastLocation', JSON.stringify({
                latitude, longitude,
                distance: null,
                isInside: false,
                isMocked: true,
                timestamp: new Date().toISOString(),
            }));
            const lastNotified = Number(await AsyncStorage.getItem('bgMockNotifiedAt')) || 0;
            if (Date.now() - lastNotified > MOCK_NOTIFY_COOLDOWN_MS) {
                await notificationService.notifyMockLocation(MOCK_LOCATION_MESSAGE);
                await AsyncStorage.setItem('bgMockNotifiedAt', String(Date.now()));
            }
        } catch (e) {
            console.error('[BgTask] Mock-location handling error:', e);
        }
        return;
    }

    // ── Geofence check ────────────────────────────────────────────────────────
    // Inside = within MAX_DISTANCE of ANY configured store
    const { allowed: isInside, store, distance } = checkStoreLocation(latitude, longitude);
    const now = Date.now();

    console.log(`[BgTask] nearest=${store?.name} dist=${distance}m inside=${isInside}`);

    // ── Read persisted state ──────────────────────────────────────────────────
    const cooldowns = await getLastActionTimes();
    const wasInside = await getWasInside(); // null | true | false

    // ── Fetch status ──────────────────────────────────────────────────────────
    // ✅ FIX: this task runs in a headless JS isolate on Android — a plain
    // `attendanceService.statusCache` read is ALWAYS empty here because that's
    // a fresh instance, not the one the foreground app is using. That was
    // causing a full getAttendanceHistory() API call on every single GPS tick.
    // getCachedStatus() hydrates the TTL cache from AsyncStorage first, so a
    // status set by the foreground app (or a previous bg tick) is actually
    // visible here, and we only hit the API on a genuine cache miss.
    let isCheckedIn = false;
    let historyData = [];

    try {
        const cachedStatus = await attendanceService.getCachedStatus(employeeNumber); // ✅ CHANGED

        if (cachedStatus !== null) {
            isCheckedIn = cachedStatus === 'CHECKED_IN';
            console.log(`[BgTask] Status from persisted cache: ${cachedStatus}`);
        } else {
            const history = await attendanceService.getAttendanceHistory(employeeNumber);
            historyData = history.data || [];

            // Stale session recovery
            if (isSessionStaleFromHistory(historyData)) {
                console.log('[BgTask] Stale session — recovering');
                await attendanceService.checkOut(employeeNumber, latitude, longitude);
                if (isInside) {
                    const checkin = await attendanceService.checkIn(employeeNumber, latitude, longitude);
                    console.log('[BgTask] Fresh check-in after recovery:', checkin.success);
                    await AsyncStorage.setItem('lastAutoAction', JSON.stringify({
                        action: 'CHECK_IN',
                        timestamp: new Date().toISOString(),
                        message: 'Auto checked in (session recovery)',
                    }));
                    await setLastActionTimes({ ...cooldowns, lastCheckIn: now });
                    await setWasInside(true);

                    if (checkin.success) {
                        await notificationService.notifyCheckIn(new Date());
                    }
                } else {
                    await setWasInside(false);
                }
                return;
            }

            const derivedStatus = attendanceService._deriveStatus(history);
            isCheckedIn = derivedStatus === 'CHECKED_IN';

            // ✅ NEW: persist what we just derived so the NEXT tick — even in a
            // brand-new isolate — hits the cache instead of the API again.
            await attendanceService.setStatusCache(
                employeeNumber,
                derivedStatus,
                attendanceService.openSessionCheckIn
            );
        }
    } catch (e) {
        console.error('[BgTask] Could not get status:', e);
        return;
    }

    // ── Edge-based transitions (wasInside → isInside) ─────────────────────────
    // This is what enables re-entry auto check-in when app is closed.
    // wasInside=null means first run — treat as edge just happened if state matches.

    // ── Edge-based transitions (wasInside → isInside) ─────────────────────────
    // Improved for reliable re-entry when app is closed/killed
    const enteredOffice = isInside && (wasInside === false || wasInside === null);
    const exitedOffice = !isInside && (wasInside === true || wasInside === null);
    const firstRun = wasInside === null;

    console.log(`[BgTask] wasInside=${wasInside} | entered=${enteredOffice} | exited=${exitedOffice} | firstRun=${firstRun}`);

    // ── AUTO CHECK-IN ─────────────────────────────────────────────────────────
    if (isInside && !isCheckedIn && (enteredOffice || firstRun)) {
        if ((now - cooldowns.lastCheckIn) < BG_COOLDOWN_MS) {
            console.log(`[BgTask] Check-in cooldown active — skipping`);
            await setWasInside(isInside);
            return;
        }

        console.log('[BgTask] AUTO CHECK-IN triggered');
        try {
            const result = await attendanceService.checkIn(employeeNumber, latitude, longitude);
            console.log('[BgTask] Check-in:', result.success, result.message);
            await AsyncStorage.setItem('lastAutoAction', JSON.stringify({
                action: 'CHECK_IN',
                timestamp: new Date().toISOString(),
                message: result.message || 'Checked in automatically',
            }));
            await setLastActionTimes({ ...cooldowns, lastCheckIn: now });

            // ✅ Fires a real push notification — shows up even when the app is
            // fully killed, because this task runs headless.
            if (result.success && !result.alreadyCheckedIn) {
                await notificationService.notifyCheckIn(new Date());
            }
        } catch (e) {
            console.error('[BgTask] Check-in error:', e);
        }
        await setWasInside(true);
        return;
    };

    // ── AUTO CHECK-OUT ────────────────────────────────────────────────────────
    if (!isInside && isCheckedIn && (exitedOffice || firstRun)) {
        if ((now - cooldowns.lastCheckOut) < BG_COOLDOWN_MS) {
            console.log(`[BgTask] Check-out cooldown active — skipping`);
            await setWasInside(isInside);
            return;
        }

        console.log('[BgTask] AUTO CHECK-OUT triggered');
        try {
            const result = await attendanceService.checkOut(employeeNumber, latitude, longitude);
            console.log('[BgTask] Check-out:', result.success, result.message);
            const durationMinutes = result.data?.attendance?.durationMinutes || 0;
            await AsyncStorage.setItem('lastAutoAction', JSON.stringify({
                action: 'CHECK_OUT',
                timestamp: new Date().toISOString(),
                message: result.message || 'Checked out automatically',
                duration: durationMinutes,
            }));
            await setLastActionTimes({ ...cooldowns, lastCheckOut: now });

            // ✅ Fires a real push notification on checkout too
            if (result.success) {
                await notificationService.notifyCheckOut(new Date(), durationMinutes);
            }
        } catch (e) {
            console.error('[BgTask] Check-out error:', e);
        }
        await setWasInside(false);
        return;
    }

    // ── Update wasInside even when no action taken ────────────────────────────
    await setWasInside(isInside);
    console.log(`[BgTask] No action needed (inside=${isInside}, checkedIn=${isCheckedIn})`);
});