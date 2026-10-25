// services/autoAttendance.service.js
//
// AUTOMATIC ATTENDANCE (no buttons).
//
// While a user is logged in, every store in STORES gets a MAX_DISTANCE (100 m) geofence
// (react-native-background-geolocation). Entering one checks the user in,
// leaving it checks them out — app open, in the background, or closed.
// Re-entering the same day starts a new session.
//
// When the app is closed, Android delivers events to the headless task
// registered in /index.js; iOS relaunches the app in the background and the
// onGeofence listener below handles them.
//
// Because the OS can occasionally miss a geofence event, reconcile() also
// compares the live position with the attendance status whenever the app opens.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_DISTANCE, MOCK_LOCATION_MESSAGE, STORES, checkStoreLocation } from '../utils/location';
import attendanceService from './attendance.service';
import eventEmitter from './eventEmitter';
import notificationService from './notification.service';

const GEOFENCE_PREFIX = 'store:';
// Check-in/out that could not reach the server — retried later (latest wins)
const PENDING_KEY = 'pendingAutoAttendance';
// reconcile() only acts on a fix at least this accurate, and only checks out
// when clearly outside — so GPS drift at the edge cannot flip the status.
const RECONCILE_MAX_ACCURACY = 50; // m
const RECONCILE_EXIT_MARGIN = 50; // m beyond MAX_DISTANCE

// The native module only exists in a build made after the library was added.
// In Expo Go or an older dev build, requiring it throws — automatic attendance
// is then unavailable instead of crashing the whole app.
let BackgroundGeolocation = null;
try {
    BackgroundGeolocation = require('react-native-background-geolocation').default;
} catch (e) {
    console.warn(
        '[AutoAttendance] Native module missing — automatic attendance disabled. Make a new build (eas build) to enable it.',
        e?.message
    );
}

const CONFIG = BackgroundGeolocation && {
    geolocation: {
        desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
        locationAuthorizationRequest: 'Always',
        // Android: watch geofences with GPS instead of relying only on the OS
        // geofencing, which can report entry/exit many minutes late.
        geofenceModeHighAccuracy: true,
        // Already inside a store when monitoring starts → check in right away
        geofenceInitialTriggerEntry: true,
    },
    activity: {
        // No ACTIVITY_RECOGNITION permission (Play treats it as a health
        // permission; it is blocked in app.config.js). Geofences work without it.
        disableMotionActivityUpdates: true,
    },
    app: {
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        notification: {
            title: 'HT-ontrack attendance',
            text: 'Auto attendance on — you are checked in/out as you enter or leave a store.',
        },
        backgroundPermissionRationale: {
            title: "Allow HT-ontrack to use your location 'all the time'?",
            message:
                'Attendance is automatic: HT-ontrack checks you in and out when you enter or leave a store, even when the app is closed.',
            positiveAction: "Change to '{backgroundPermissionOptionLabel}'",
            negativeAction: 'Cancel',
        },
    },
    logger: {
        debug: false,
        logLevel: __DEV__
            ? BackgroundGeolocation.LogLevel.Verbose
            : BackgroundGeolocation.LogLevel.Error,
    },
};

const storeGeofences = () =>
    STORES.map((store) => ({
        identifier: GEOFENCE_PREFIX + store.name,
        latitude: store.latitude,
        longitude: store.longitude,
        radius: MAX_DISTANCE,
        notifyOnEntry: true,
        notifyOnExit: true,
    }));

let readyPromise = null;
let geofenceSubscription = null;
let startPromise = null;
// Check-ins/outs run one at a time so an ENTRY and EXIT never race
let queue = Promise.resolve();
const enqueue = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch((e) => console.error('[AutoAttendance] Action failed:', e));
    return run;
};

// Listener first, then ready() — so an event that relaunched the app is not missed.
function ensureReady() {
    if (!geofenceSubscription) {
        geofenceSubscription = BackgroundGeolocation.onGeofence((event) => {
            handleGeofenceEvent(event).catch((e) =>
                console.error('[AutoAttendance] Geofence handler error:', e)
            );
        });
    }
    if (!readyPromise) {
        readyPromise = BackgroundGeolocation.ready(CONFIG).catch((e) => {
            readyPromise = null;
            throw e;
        });
    }
    return readyPromise;
}

async function getEmployeeNumber() {
    const raw = await AsyncStorage.getItem('userData');
    return raw ? JSON.parse(raw)?.employeeNumber || null : null;
}

// action: 'in' | 'out'. Returns once the attempt is finished or saved for retry.
async function submit(pending) {
    const { action, employeeNumber, latitude, longitude } = pending;
    const result =
        action === 'in'
            ? await attendanceService.checkIn(employeeNumber, latitude, longitude)
            : await attendanceService.checkOut(employeeNumber, latitude, longitude);

    if (!result.success && result.retryable) {
        console.warn(`[AutoAttendance] Check-${action} failed, will retry:`, result.message);
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        return;
    }

    await AsyncStorage.removeItem(PENDING_KEY);

    if (!result.success) {
        // e.g. checking out while not checked in — nothing left to do
        console.log(`[AutoAttendance] Check-${action} rejected:`, result.message);
        return;
    }
    if (result.alreadyCheckedIn) return; // no change, no notification

    const attendance = result.data?.attendance;
    const time =
        (action === 'in' ? attendance?.checkIn : attendance?.checkOut) ||
        new Date().toISOString();

    if (action === 'in') {
        await notificationService.notifyCheckIn(new Date(time));
    } else {
        await notificationService.notifyCheckOut(
            new Date(time),
            attendance?.durationMinutes || 0
        );
    }
    eventEmitter.emit('AUTO_ATTENDANCE', { action, time });
    eventEmitter.emit('ATTENDANCE_UPDATED');
}

async function act(action, coords) {
    const employeeNumber = await getEmployeeNumber();
    if (!employeeNumber) return;
    await submit({
        action,
        employeeNumber,
        latitude: coords.latitude,
        longitude: coords.longitude,
        at: new Date().toISOString(),
    });
}

export function handleGeofenceEvent(event) {
    if (!event?.identifier?.startsWith(GEOFENCE_PREFIX)) return Promise.resolve();
    const action =
        event.action === 'ENTER' ? 'in' : event.action === 'EXIT' ? 'out' : null;
    if (!action) return Promise.resolve();

    return enqueue(async () => {
        if (event.location?.mock) {
            // Never act on a fake position
            await notificationService.notifyMockLocation(MOCK_LOCATION_MESSAGE);
            return;
        }
        console.log(`[AutoAttendance] ${event.action} ${event.identifier}`);
        await act(action, event.location.coords);
    });
}

// Android headless task (app closed). Called once from /index.js.
export function registerHeadlessTask() {
    BackgroundGeolocation?.registerHeadlessTask(async (event) => {
        if (event?.name === 'geofence') {
            await handleGeofenceEvent(event.params);
        }
    });
}

// App start: restore the plugin (needed after an iOS background relaunch).
export async function init() {
    if (!BackgroundGeolocation) return; // Expo Go / old build — already warned
    try {
        await ensureReady();
    } catch (e) {
        console.error('[AutoAttendance] ready() failed:', e);
    }
}

// Logged in: make sure all store geofences are being watched. Asks for
// "Always" location the first time. Safe to call repeatedly.
export function start() {
    if (!BackgroundGeolocation) return Promise.resolve(getStatus());
    if (!startPromise) {
        startPromise = (async () => {
            try {
                await ensureReady();
                const existing = await BackgroundGeolocation.getGeofences();
                const wanted = storeGeofences();
                const upToDate =
                    existing.length === wanted.length &&
                    wanted.every((g) =>
                        existing.some(
                            (e) => e.identifier === g.identifier && e.radius === g.radius
                        )
                    );
                if (!upToDate) {
                    await BackgroundGeolocation.removeGeofences();
                    await BackgroundGeolocation.addGeofences(wanted);
                }
                const state = await BackgroundGeolocation.getState();
                if (!state.enabled) {
                    await BackgroundGeolocation.startGeofences();
                }
                console.log('[AutoAttendance] Watching', wanted.length, 'stores');
            } catch (e) {
                console.error('[AutoAttendance] Failed to start:', e);
            } finally {
                startPromise = null;
            }
            await retryPending();
            await reconcile();
            return getStatus();
        })();
    }
    return startPromise;
}

// Logout
export async function stop() {
    if (!BackgroundGeolocation) return;
    try {
        await BackgroundGeolocation.removeGeofences();
        await BackgroundGeolocation.stop();
        await AsyncStorage.removeItem(PENDING_KEY);
        console.log('[AutoAttendance] Stopped');
    } catch (e) {
        console.error('[AutoAttendance] Failed to stop:', e);
    }
}

// { available, enabled, always } — for the Attendance screen banner.
// available=false: this build has no native module (e.g. Expo Go).
// always=false: user has not allowed location "all the time".
export async function getStatus() {
    if (!BackgroundGeolocation) return { available: false, enabled: false, always: false };
    try {
        await ensureReady();
        const [state, provider] = await Promise.all([
            BackgroundGeolocation.getState(),
            BackgroundGeolocation.getProviderState(),
        ]);
        return {
            available: true,
            enabled: state.enabled,
            always: provider.status === BackgroundGeolocation.AuthorizationStatus.Always,
        };
    } catch {
        return { available: true, enabled: false, always: false };
    }
}

export function retryPending() {
    return enqueue(async () => {
        const raw = await AsyncStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw);
        // Only for the user who is still logged in
        if (pending?.employeeNumber !== (await getEmployeeNumber())) {
            await AsyncStorage.removeItem(PENDING_KEY);
            return;
        }
        await submit(pending);
    });
}

// Safety net for a missed geofence event: on app open, if the live position
// and the attendance status disagree, fix it.
export function reconcile() {
    if (!BackgroundGeolocation) return Promise.resolve();
    return enqueue(async () => {
        const employeeNumber = await getEmployeeNumber();
        if (!employeeNumber) return;

        let location;
        try {
            location = await BackgroundGeolocation.getCurrentPosition({
                samples: 3,
                persist: false,
                timeout: 30,
                maximumAge: 10000,
            });
        } catch {
            return; // no fix (GPS off, no permission) — try again next time
        }
        if (location.mock || location.coords.accuracy > RECONCILE_MAX_ACCURACY) return;

        const { allowed, distance } = checkStoreLocation(
            location.coords.latitude,
            location.coords.longitude
        );
        const status = await attendanceService.getCurrentStatus(employeeNumber);

        if (allowed && status === 'CHECKED_OUT') {
            console.log('[AutoAttendance] Reconcile: inside a store but checked out — checking in');
            await act('in', location.coords);
        } else if (
            status === 'CHECKED_IN' &&
            distance != null &&
            distance > MAX_DISTANCE + RECONCILE_EXIT_MARGIN
        ) {
            console.log('[AutoAttendance] Reconcile: away from stores but checked in — checking out');
            await act('out', location.coords);
        }
    });
}
