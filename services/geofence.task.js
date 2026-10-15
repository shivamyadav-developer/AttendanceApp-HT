// services/geofence.task.js
//
// Automatic (background) check-in/out has been REMOVED — attendance is now
// manual via the Check In / Check Out buttons.
//
// The task is still defined because phones that ran an older app version may
// still have it registered. If it fires, it only switches itself off.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {
    try {
        const running = await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
        );
        if (running) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
            console.log('[BgTask] Auto attendance removed — background task stopped');
        }
    } catch (e) {
        console.error('[BgTask] Failed to stop background task:', e);
    }
});
