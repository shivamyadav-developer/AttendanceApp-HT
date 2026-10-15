// services/notificationSettings.js
// User's notification preferences, saved on the device.
// Stored in AsyncStorage so the headless background task can read them too.
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'notificationSettings';

// ON by default — same behaviour as before this setting existed
export const DEFAULT_NOTIFICATION_SETTINGS = {
    pushEnabled: true,
};

export async function getNotificationSettings() {
    try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
        return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
}

// Merge-update, e.g. updateNotificationSettings({ pushEnabled: false })
export async function updateNotificationSettings(changes) {
    const next = { ...(await getNotificationSettings()), ...changes };
    try {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {
        console.error('[NotificationSettings] Save failed:', e);
    }
    return next;
}
