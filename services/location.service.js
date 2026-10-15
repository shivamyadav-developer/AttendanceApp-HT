// services/location.service.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert, AppState } from 'react-native';
import { MOCK_LOCATION_MESSAGE, checkStoreLocation, isMockLocation } from '../utils/location';
import attendanceService from './attendance.service';
import eventEmitter from './eventEmitter';
import { BACKGROUND_LOCATION_TASK } from './geofence.task';
import notificationService from './notification.service';

class LocationService {
    constructor() {
        this.locationSubscription = null;
        this.appStateSubscription = null;
        this.isTracking = false;
        this.appState = AppState.currentState;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.isProcessing = false;
        this.lastCheckInTime = 0;
        this.lastCheckOutTime = 0;
        this.CHECK_IN_COOLDOWN = 30_000;
        this.CHECK_OUT_COOLDOWN = 30_000;
        this.STALE_RECOVERY_COOLDOWN = 30_000;
        this.lastStaleRecoveryTime = 0;
        this.wasInsideOffice = null;
        this.midnightTimeout = null;
        this.lastMockAlertTime = 0;
        this.MOCK_ALERT_COOLDOWN = 5 * 60_000;
    }

    // ── ✅ NEW: Persist wasInside across app restarts ─────────────────────────
    async _loadWasInside() {
        try {
            const raw = await AsyncStorage.getItem('bgTaskWasInside');
            if (raw === null) return null;
            return raw === 'true';
        } catch { return null; }
    }

    async _saveWasInside(value) {
        try {
            await AsyncStorage.setItem('bgTaskWasInside', String(value));
        } catch { }
    }

    // ── Permission helpers ───────────────────────────────────────────────────

    async _requestPermissions() {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Please allow location access for attendance tracking. You can enable it in Settings.'
            );
            return false;
        }

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            Alert.alert(
                'Background Location Required',
                'To auto check-in/out when the app is closed, please select "Always" for location access in Settings.',
                [{ text: 'OK' }]
            );
        }

        return true;
    }

    // ── Background task ──────────────────────────────────────────────────────

    async _startBackgroundTask() {
        try {
            const isRegistered = await Location.hasStartedLocationUpdatesAsync(
                BACKGROUND_LOCATION_TASK
            );
            if (isRegistered) {
                console.log('[LocationService] Background task already running');
                return;
            }

            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 10000,
                distanceInterval: 8,
                foregroundService: {
                    notificationTitle: 'Attendance Tracking',
                    notificationBody: 'Tracking your location for auto check-in/out',
                    notificationColor: '#D96A17',
                },
                pausesUpdatesAutomatically: false,
                showsBackgroundLocationIndicator: true,
                activityType: Location.ActivityType.Other,
            });

            console.log('[LocationService] Background task started');
        } catch (err) {
            console.error('[LocationService] Failed to start background task:', err);
        }
    }

    async _stopBackgroundTask() {
        try {
            const isRegistered = await Location.hasStartedLocationUpdatesAsync(
                BACKGROUND_LOCATION_TASK
            );
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
                console.log('[LocationService] Background task stopped');
            }
        } catch (err) {
            console.error('[LocationService] Failed to stop background task:', err);
        }
    }

    // ── Main start ───────────────────────────────────────────────────────────

    async startTracking() {
        if (this.isTracking) {
            console.log('[LocationService] Tracking already active');
            return true;
        }

        try {
            const userData = await AsyncStorage.getItem('userData');
            if (!userData) {
                console.log('[LocationService] No user logged in, skipping tracking');
                return false;
            }

            const permOk = await this._requestPermissions();
            if (!permOk) return false;

            // ✅ Restore wasInside from AsyncStorage so we don't false-trigger on restart
            this.wasInsideOffice = await this._loadWasInside();
            console.log('[LocationService] Restored wasInside:', this.wasInsideOffice);

            this.locationSubscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 1000,
                    distanceInterval: 3,
                },
                this.handleLocationUpdate.bind(this)
            );

            this.isTracking = true;
            console.log('[LocationService] Foreground tracking started');

            this.appStateSubscription = AppState.addEventListener(
                'change',
                this.handleAppStateChange.bind(this)
            );

            await this._startBackgroundTask();

            this.scheduleMidnightRollover();
            await this.getCurrentLocation();

            return true;

        } catch (error) {
            console.error('[LocationService] Failed to start tracking:', error);
            this.isTracking = false;
            return false;
        }
    }

    // ── Foreground location handler ──────────────────────────────────────────

    async handleLocationUpdate(location) {
        // ── Mock-location guard: no check-in, no check-out, state untouched ──
        if (isMockLocation(location)) {
            await this._handleMockLocation(location);
            return;
        }

        // Inside = within MAX_DISTANCE of ANY configured store
        const { allowed: isInsideOffice, store, distance } = checkStoreLocation(
            location.coords.latitude,
            location.coords.longitude
        );

        eventEmitter.emit('LOCATION_UPDATED', {
            distance,
            isInside: isInsideOffice,
            isMocked: false,
            storeName: store?.name ?? null,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date().toISOString(),
        });

        await this._saveLastLocation(location.coords, distance, isInsideOffice, store?.name);

        if (this.isProcessing) return;

        try {
            this.isProcessing = true;

            const userData = await AsyncStorage.getItem('userData');
            if (!userData) {
                console.log('[LocationService] No user data, stopping tracking');
                this.stopTracking();
                return;
            }

            const user = JSON.parse(userData);
            const employeeNumber = user.employeeNumber;
            if (!employeeNumber) return;

            const now = Date.now();

            const currentStatus = await attendanceService.getCurrentStatus(employeeNumber);
            const isCheckedIn = currentStatus === 'CHECKED_IN';

            console.log(
                `[LocationService] nearest=${store?.name} dist=${distance}m inside=${isInsideOffice} ` +
                `checkedIn=${isCheckedIn} wasInside=${this.wasInsideOffice}`
            );

            // ── STALE SESSION RECOVERY ────────────────────────────────────────
            if (
                isCheckedIn &&
                attendanceService.isOpenSessionStale() &&
                (now - this.lastStaleRecoveryTime) > this.STALE_RECOVERY_COOLDOWN
            ) {
                console.log('[LocationService] Stale open session — recovering...');
                this.lastStaleRecoveryTime = now;

                await attendanceService.checkOut(
                    employeeNumber,
                    location.coords.latitude,
                    location.coords.longitude
                );

                if (isInsideOffice) {
                    this.lastCheckInTime = now;
                    this.wasInsideOffice = true;
                    await this._saveWasInside(true);
                    await this.performCheckIn(
                        employeeNumber,
                        location.coords.latitude,
                        location.coords.longitude
                    );
                } else {
                    this.wasInsideOffice = false;
                    await this._saveWasInside(false);
                }

                this.retryCount = 0;
                return;
            }

            // ── AUTO CHECK-IN ─────────────────────────────────────────────────
            if (
                isInsideOffice &&
                !isCheckedIn &&
                (now - this.lastCheckInTime) > this.CHECK_IN_COOLDOWN
            ) {
                console.log('[LocationService] AUTO CHECK-IN triggered');
                this.lastCheckInTime = now;
                this.wasInsideOffice = true;
                await this._saveWasInside(true);
                await this.performCheckIn(
                    employeeNumber,
                    location.coords.latitude,
                    location.coords.longitude
                );
            }
            // ── AUTO CHECK-OUT ────────────────────────────────────────────────
            else if (
                !isInsideOffice &&
                isCheckedIn &&
                (now - this.lastCheckOutTime) > this.CHECK_OUT_COOLDOWN
            ) {
                console.log('[LocationService] AUTO CHECK-OUT triggered');
                this.lastCheckOutTime = now;
                this.wasInsideOffice = false;
                await this._saveWasInside(false);
                await this.performCheckOut(
                    employeeNumber,
                    location.coords.latitude,
                    location.coords.longitude
                );
            } else {
                this.wasInsideOffice = isInsideOffice;
                await this._saveWasInside(isInsideOffice);
            }

            this.retryCount = 0;

        } catch (error) {
            console.error('[LocationService] Error handling location update:', error);
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.handleLocationUpdate(location), 2000 * this.retryCount);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    // ── Mock location ────────────────────────────────────────────────────────

    async _handleMockLocation(location) {
        console.warn('[LocationService] Mock location detected → blocking attendance action');

        eventEmitter.emit('LOCATION_UPDATED', {
            distance: null,
            isInside: false,
            isMocked: true,
            storeName: null,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date().toISOString(),
        });

        await AsyncStorage.setItem('lastLocation', JSON.stringify({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            distance: null,
            isInside: false,
            isMocked: true,
            timestamp: new Date().toISOString(),
        }));

        const now = Date.now();
        if (now - this.lastMockAlertTime < this.MOCK_ALERT_COOLDOWN) return;
        this.lastMockAlertTime = now;

        if (AppState.currentState === 'active') {
            Alert.alert('Fake Location Detected', MOCK_LOCATION_MESSAGE, [{ text: 'OK' }]);
        } else {
            await notificationService.notifyMockLocation(MOCK_LOCATION_MESSAGE);
        }
    }

    // ── Check-in / Check-out helpers ─────────────────────────────────────────

    async performCheckIn(employeeNumber, latitude, longitude) {
        try {
            console.log('[LocationService] Performing check-in...');
            const result = await attendanceService.checkIn(employeeNumber, latitude, longitude);

            if (result.success) {
                console.log('[LocationService] Check-in OK:', result.message);

                await AsyncStorage.setItem('lastAutoAction', JSON.stringify({
                    action: 'CHECK_IN',
                    timestamp: new Date().toISOString(),
                    message: result.message,
                }));

                const isForeground = AppState.currentState === 'active';

                if (isForeground && !result.alreadyCheckedIn) {
                    Alert.alert(
                        'Auto Check-In ✓',
                        `Welcome! Checked in at ${new Date().toLocaleTimeString()}`,
                        [{ text: 'OK' }]
                    );
                }

                if (!isForeground && !result.alreadyCheckedIn) {
                    await notificationService.notifyCheckIn(new Date());
                }

                setTimeout(() => {
                    eventEmitter.emit('ATTENDANCE_UPDATED');
                }, 1500);

                setTimeout(() => {
                    attendanceService.clearStatusCache();
                }, 5000);

            } else {
                console.error('[LocationService] Check-in failed:', result.message);
                this.lastCheckInTime = 0;
            }
        } catch (error) {
            console.error('[LocationService] Check-in error:', error);
            this.lastCheckInTime = 0;
        }
    }

    async performCheckOut(employeeNumber, latitude, longitude) {
        try {
            console.log('[LocationService] Performing check-out...');
            const result = await attendanceService.checkOut(employeeNumber, latitude, longitude);

            if (result.success) {
                console.log('[LocationService] Check-out OK:', result.message);

                const durationMinutes = result.data?.attendance?.durationMinutes || 0;
                let durationMsg = '';
                if (durationMinutes) {
                    durationMsg = `\nTotal: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;
                }

                await AsyncStorage.setItem('lastAutoAction', JSON.stringify({
                    action: 'CHECK_OUT',
                    timestamp: new Date().toISOString(),
                    duration: durationMinutes,
                    message: result.message,
                }));

                const isForeground = AppState.currentState === 'active';

                if (isForeground) {
                    Alert.alert(
                        'Auto Check-Out ✓',
                        `Checked out at ${new Date().toLocaleTimeString()}.${durationMsg}`,
                        [{ text: 'OK' }]
                    );
                }

                if (!isForeground) {
                    await notificationService.notifyCheckOut(new Date(), durationMinutes);
                }

                setTimeout(() => {
                    eventEmitter.emit('ATTENDANCE_UPDATED');
                }, 1500);

                setTimeout(() => {
                    attendanceService.clearAll();
                }, 5000);

            } else {
                console.error('[LocationService] Check-out failed:', result.message);
                this.lastCheckOutTime = 0;
            }
        } catch (error) {
            console.error('[LocationService] Check-out error:', error);
            this.lastCheckOutTime = 0;
        }
    }

    // ── App state changes ────────────────────────────────────────────────────

    handleAppStateChange(nextAppState) {
        console.log(`[LocationService] AppState: ${this.appState} → ${nextAppState}`);

        if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
            console.log('[LocationService] App foregrounded — refreshing');
            attendanceService.clearStatusCache();
            eventEmitter.emit('ATTENDANCE_UPDATED');
            this.getCurrentLocation();
        }

        this.appState = nextAppState;
    }

    // ── Stop ─────────────────────────────────────────────────────────────────

    stopTracking() {
        if (this.locationSubscription) {
            this.locationSubscription.remove();
            this.locationSubscription = null;
            this.isTracking = false;
            console.log('[LocationService] Foreground tracking stopped');
        }
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
        if (this.midnightTimeout) {
            clearTimeout(this.midnightTimeout);
            this.midnightTimeout = null;
        }
    }

    // ✅ NEW: clear in-memory state so a fresh login doesn't inherit
    // the previous user's geofence/cooldown state.
    _resetState() {
        this.retryCount = 0;
        this.isProcessing = false;
        this.lastCheckInTime = 0;
        this.lastCheckOutTime = 0;
        this.lastStaleRecoveryTime = 0;
        this.wasInsideOffice = null;
        this.lastMockAlertTime = 0;
    }

    // ✅ CHANGED: now actually unregisters the background task AND clears
    // the persisted keys that background task uses, so nothing survives
    // into the next user's session.
    async stopAllTracking() {
        this.stopTracking();
        await this._stopBackgroundTask();
        this._resetState();
        try {
            await AsyncStorage.multiRemove([
                'bgTaskWasInside',
                'bgTaskCooldowns',
                'lastAutoAction',
                'lastLocation',
                'bgMockNotifiedAt',
            ]);
        } catch (e) {
            console.error('[LocationService] Failed clearing bg keys:', e);
        }
        console.log('[LocationService] All tracking stopped');
    }

    // ── Midnight rollover ────────────────────────────────────────────────────

    scheduleMidnightRollover() {
        if (this.midnightTimeout) clearTimeout(this.midnightTimeout);

        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 5, 0);
        const ms = nextMidnight.getTime() - now.getTime();

        console.log(`[LocationService] Midnight rollover in ${Math.round(ms / 1000)}s`);
        this.midnightTimeout = setTimeout(() => this.handleMidnightRollover(), ms);
    }

    async handleMidnightRollover() {
        try {
            console.log('[LocationService] Midnight rollover');
            const userData = await AsyncStorage.getItem('userData');
            if (!userData) return;
            const { employeeNumber } = JSON.parse(userData);
            if (!employeeNumber) return;

            const status = await attendanceService.getCurrentStatus(employeeNumber);
            if (status !== 'CHECKED_IN') return;

            // Fall back to the last known fix if a fresh one isn't available
            let location = await this.getCurrentLocation();
            if (!location) {
                const raw = await AsyncStorage.getItem('lastLocation');
                location = raw ? { ...JSON.parse(raw), isInside: false } : null;
            }
            if (!location) {
                console.log('[LocationService] No location for midnight rollover — skipping');
                return;
            }
            // Never act on a fake fix; stale-session recovery will close it later
            if (location.isMocked) {
                console.warn('[LocationService] Mock location at midnight rollover — skipping');
                return;
            }
            const lat = location.latitude;
            const lng = location.longitude;

            console.log("[LocationService] Closing yesterday's session");
            await attendanceService.checkOut(employeeNumber, lat, lng);

            if (location?.isInside) {
                console.log("[LocationService] Still inside — opening today's session");
                this.lastCheckInTime = Date.now();
                this.wasInsideOffice = true;
                await this._saveWasInside(true);
                await this.performCheckIn(employeeNumber, lat, lng);
            } else {
                attendanceService.clearAll();
                this.wasInsideOffice = false;
                await this._saveWasInside(false);
                eventEmitter.emit('ATTENDANCE_UPDATED');
            }
        } catch (error) {
            console.error('[LocationService] Midnight rollover error:', error);
        } finally {
            this.scheduleMidnightRollover();
        }
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    async _saveLastLocation(coords, distance, isInside, storeName = null) {
        await AsyncStorage.setItem('lastLocation', JSON.stringify({
            latitude: coords.latitude,
            longitude: coords.longitude,
            distance,
            isInside,
            storeName,
            timestamp: new Date().toISOString(),
        }));
    }

    async getCurrentLocation() {
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') return null;

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const isMocked = isMockLocation(location);
            const { allowed, store, distance } = checkStoreLocation(
                location.coords.latitude,
                location.coords.longitude
            );

            // A mocked fix is never treated as "inside" a store
            const result = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                distance: isMocked ? null : distance,
                isInside: isMocked ? false : allowed,
                isMocked,
                storeName: isMocked ? null : (store?.name ?? null),
                timestamp: new Date().toISOString(),
            };

            await AsyncStorage.setItem('lastLocation', JSON.stringify(result));
            return result;
        } catch (error) {
            console.error('[LocationService] Error getting location:', error);
            return null;
        }
    }

    async getDistanceFromOffice() {
        const loc = await this.getCurrentLocation();
        return loc ? loc.distance : null;
    }

    async isInsideOffice() {
        const loc = await this.getCurrentLocation();
        return loc ? loc.isInside : false;
    }

    async getLastAutoAction() {
        try {
            const raw = await AsyncStorage.getItem('lastAutoAction');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    async clearLastAutoAction() {
        try { await AsyncStorage.removeItem('lastAutoAction'); } catch { }
    }
}

export default new LocationService();