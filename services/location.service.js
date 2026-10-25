// services/location.service.js
//
// Attendance is AUTOMATIC: autoAttendance.service checks the user in/out
// when they enter or leave a store's MAX_DISTANCE area (started here on login).
//
// This service also watches GPS while the app is open, because:
//  - the Attendance screen shows the distance to the nearest store
//  - the delivery / fitter tracking maps listen to LOCATION_UPDATED
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert, AppState } from 'react-native';
import { checkStoreLocation, isMockLocation } from '../utils/location';
import attendanceService from './attendance.service';
import * as autoAttendance from './autoAttendance.service';
import eventEmitter from './eventEmitter';
import { BACKGROUND_LOCATION_TASK } from './geofence.task';

// Keys the old automatic (background) attendance used — cleared on logout
const LEGACY_KEYS = [
    'bgTaskWasInside',
    'bgTaskCooldowns',
    'lastAutoAction',
    'bgMockNotifiedAt',
];

class LocationService {
    constructor() {
        this.locationSubscription = null;
        this.appStateSubscription = null;
        this.isTracking = false;
        this.appState = AppState.currentState;
    }

    // ── Permissions ──────────────────────────────────────────────────────────
    // "While using the app" here; autoAttendance.start() then asks for "Always".

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
            autoAttendance.start();
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

            // Geofences for automatic check-in/out (asks for "Always" location).
            // Not awaited, so login is not held up by the permission screen.
            autoAttendance.start();
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
        await autoAttendance.stop();
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

    // ── App state ────────────────────────────────────────────────────────────

    handleAppStateChange(nextAppState) {
        if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
            console.log('[LocationService] App foregrounded — refreshing');
            attendanceService.clearStatusCache();
            eventEmitter.emit('ATTENDANCE_UPDATED');
            this.getCurrentLocation();
            autoAttendance.retryPending();
            autoAttendance.reconcile();
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
