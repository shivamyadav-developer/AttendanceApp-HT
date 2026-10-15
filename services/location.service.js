// services/location.service.js
//
// Attendance is MANUAL: the user taps Check In / Check Out on the
// Attendance screen. Nothing is checked in or out automatically.
//
// This service still watches GPS while the app is open, because:
//  - the Attendance screen shows the distance to the nearest store
//  - the delivery / fitter tracking maps listen to LOCATION_UPDATED
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert, AppState } from 'react-native';
import {
    MAX_DISTANCE,
    MOCK_LOCATION_MESSAGE,
    checkStoreLocation,
    isMockLocation,
} from '../utils/location';
import attendanceService from './attendance.service';
import eventEmitter from './eventEmitter';
import { BACKGROUND_LOCATION_TASK } from './geofence.task';

// Keys the old automatic (background) attendance used — cleared on logout
const LEGACY_KEYS = [
    'bgTaskWasInside',
    'bgTaskCooldowns',
    'lastAutoAction',
    'bgMockNotifiedAt',
];

const formatTime = (date) =>
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

class LocationService {
    constructor() {
        this.locationSubscription = null;
        this.appStateSubscription = null;
        this.isTracking = false;
        this.appState = AppState.currentState;
        this.isSubmitting = false; // a manual check-in/out is in progress
    }

    // ── Permissions ──────────────────────────────────────────────────────────
    // Only "while using the app" is needed now — no background location.

    async _requestPermissions() {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Please allow location access to check in and out. You can enable it in Settings.'
            );
            return false;
        }
        return true;
    }

    // ── Background task cleanup ──────────────────────────────────────────────
    // Older app versions ran a background task for auto check-in/out.
    // Make sure it is stopped on phones that still have it registered.

    async _stopBackgroundTask() {
        try {
            const isRegistered = await Location.hasStartedLocationUpdatesAsync(
                BACKGROUND_LOCATION_TASK
            );
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
                console.log('[LocationService] Old background task stopped');
            }
        } catch (err) {
            console.error('[LocationService] Failed to stop background task:', err);
        }
    }

    // ── Start / stop foreground location watching ────────────────────────────

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

            await this._stopBackgroundTask();

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

            await this.getCurrentLocation();
            return true;
        } catch (error) {
            console.error('[LocationService] Failed to start tracking:', error);
            this.isTracking = false;
            return false;
        }
    }

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
    }

    // Logout: stop everything and clear saved location state
    async stopAllTracking() {
        this.stopTracking();
        await this._stopBackgroundTask();
        this.isSubmitting = false;
        try {
            await AsyncStorage.multiRemove([...LEGACY_KEYS, 'lastLocation']);
        } catch (e) {
            console.error('[LocationService] Failed clearing location keys:', e);
        }
        console.log('[LocationService] All tracking stopped');
    }

    // ── GPS updates: display only, never checks in/out ───────────────────────

    async handleLocationUpdate(location) {
        const isMocked = isMockLocation(location);
        const { allowed, store, distance } = checkStoreLocation(
            location.coords.latitude,
            location.coords.longitude
        );

        // A mocked fix is never treated as "inside" a store
        const payload = {
            distance: isMocked ? null : distance,
            isInside: isMocked ? false : allowed,
            isMocked,
            storeName: isMocked ? null : (store?.name ?? null),
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date().toISOString(),
        };

        eventEmitter.emit('LOCATION_UPDATED', payload);

        try {
            await AsyncStorage.setItem('lastLocation', JSON.stringify(payload));
        } catch { }
    }

    // ── Manual check-in / check-out ──────────────────────────────────────────

    // Fresh GPS fix + checks shared by both buttons.
    // Returns { ok: true, coords, store } or { ok: false, message }.
    async _verifyAtStore(actionLabel) {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            const granted = await this._requestPermissions();
            if (!granted) {
                return { ok: false, message: 'Location permission is required.' };
            }
        }

        let location;
        try {
            location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });
        } catch (e) {
            return {
                ok: false,
                message: 'Could not get your location. Turn on GPS and try again.',
            };
        }

        if (isMockLocation(location)) {
            return { ok: false, message: MOCK_LOCATION_MESSAGE };
        }

        const { allowed, store, distance, message } = checkStoreLocation(
            location.coords.latitude,
            location.coords.longitude
        );

        // Keep the screen's distance display in sync with this fresh fix
        await this.handleLocationUpdate(location);

        if (!allowed) {
            return {
                ok: false,
                message: store
                    ? `You are ${distance} m from ${store.name}. You must be within ${MAX_DISTANCE} m of a store to ${actionLabel}.`
                    : message,
            };
        }

        return { ok: true, coords: location.coords, store };
    }

    async _getEmployeeNumber() {
        const raw = await AsyncStorage.getItem('userData');
        const user = raw ? JSON.parse(raw) : null;
        return user?.employeeNumber || null;
    }

    async manualCheckIn() {
        if (this.isSubmitting) {
            return { success: false, message: 'Please wait…' };
        }
        this.isSubmitting = true;

        try {
            const employeeNumber = await this._getEmployeeNumber();
            if (!employeeNumber) {
                return { success: false, message: 'Session expired. Please login again.' };
            }

            const check = await this._verifyAtStore('check in');
            if (!check.ok) return { success: false, message: check.message };

            const result = await attendanceService.checkIn(
                employeeNumber,
                check.coords.latitude,
                check.coords.longitude
            );

            if (!result.success) {
                return { success: false, message: result.message || 'Check-in failed. Please try again.' };
            }

            // Refresh status + history on the Attendance screen
            eventEmitter.emit('ATTENDANCE_UPDATED');

            return {
                success: true,
                // Server time if the API returns it, otherwise now
                time: result.data?.attendance?.checkIn || new Date().toISOString(),
                message: result.alreadyCheckedIn
                    ? 'You are already checked in.'
                    : `Checked in at ${formatTime(new Date())} near ${check.store.name}.`,
            };
        } catch (error) {
            console.error('[LocationService] Manual check-in error:', error);
            return { success: false, message: 'Check-in failed. Please try again.' };
        } finally {
            this.isSubmitting = false;
        }
    }

    async manualCheckOut() {
        if (this.isSubmitting) {
            return { success: false, message: 'Please wait…' };
        }
        this.isSubmitting = true;

        try {
            const employeeNumber = await this._getEmployeeNumber();
            if (!employeeNumber) {
                return { success: false, message: 'Session expired. Please login again.' };
            }

            const check = await this._verifyAtStore('check out');
            if (!check.ok) return { success: false, message: check.message };

            const result = await attendanceService.checkOut(
                employeeNumber,
                check.coords.latitude,
                check.coords.longitude
            );

            if (!result.success) {
                return { success: false, message: result.message || 'Check-out failed. Please try again.' };
            }

            eventEmitter.emit('ATTENDANCE_UPDATED');

            const minutes = result.data?.attendance?.durationMinutes || 0;
            const duration = minutes
                ? ` Total: ${Math.floor(minutes / 60)}h ${minutes % 60}m.`
                : '';

            return {
                success: true,
                // Server time if the API returns it, otherwise now
                time: result.data?.attendance?.checkOut || new Date().toISOString(),
                message: `Checked out at ${formatTime(new Date())}.${duration}`,
            };
        } catch (error) {
            console.error('[LocationService] Manual check-out error:', error);
            return { success: false, message: 'Check-out failed. Please try again.' };
        } finally {
            this.isSubmitting = false;
        }
    }

    // ── App state ────────────────────────────────────────────────────────────

    handleAppStateChange(nextAppState) {
        if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
            console.log('[LocationService] App foregrounded — refreshing');
            attendanceService.clearStatusCache();
            eventEmitter.emit('ATTENDANCE_UPDATED');
            this.getCurrentLocation();
        }
        this.appState = nextAppState;
    }

    // ── Utilities ────────────────────────────────────────────────────────────

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
}

export default new LocationService();
