// services/notification.service.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationSettings } from './notificationSettings';

// ── Foreground notification behavior ──────────────────────────────────────
// Even while the app is open, let the OS show the heads-up banner.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

const CHANNEL_ID = 'attendance-alerts';

class NotificationService {
    constructor() {
        this.isConfigured = false;
    }

    // ── Call once on app startup (e.g. in app/_layout.jsx) ────────────────
    async init() {
        try {
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
                    name: 'Attendance Alerts',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#D96A17',
                    sound: 'default',
                });
            }

            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            this.isConfigured = finalStatus === 'granted';
            console.log('[NotificationService] Permission status:', finalStatus);
            return this.isConfigured;
        } catch (err) {
            console.error('[NotificationService] Init failed:', err);
            return false;
        }
    }

    // ── Generic local notification ─────────────────────────────────────────
    // Respects the user's Push Notifications setting.
    // `force: true` shows it even when notifications are switched off.
    async _notify(title, body, data = {}, { force = false } = {}) {
        try {
            const { pushEnabled } = await getNotificationSettings();

            if (!pushEnabled && !force) {
                console.log(`[NotificationService] Skipped (notifications off): ${title}`);
                return;
            }

            await Notifications.scheduleNotificationAsync({
                content: {
                    title,
                    body,
                    sound: 'default',
                    data,
                    ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
                },
                trigger: null, // null = fire immediately
            });
        } catch (err) {
            console.error('[NotificationService] Failed to send notification:', err);
        }
    }

    async notifyCheckIn(time = new Date()) {
        const timeStr = time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
        await this._notify(
            'Checked In ✓',
            `You were auto checked in at ${timeStr}`,
            { type: 'CHECK_IN', timestamp: time.toISOString() }
        );
    }

    async notifyCheckOut(time = new Date(), durationMinutes = 0) {
        const timeStr = time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
        const h = Math.floor(durationMinutes / 60);
        const m = durationMinutes % 60;
        const durationStr = durationMinutes > 0 ? ` · Total: ${h}h ${m}m` : '';

        await this._notify(
            'Checked Out ✓',
            `You were auto checked out at ${timeStr}${durationStr}`,
            { type: 'CHECK_OUT', timestamp: time.toISOString() }
        );
    }

    // Always shown, even with notifications off, so a fake-GPS user
    // can't silence the warning.
    async notifyMockLocation(message) {
        await this._notify(
            'Attendance Blocked ⚠',
            message,
            { type: 'MOCK_LOCATION', timestamp: new Date().toISOString() },
            { force: true }
        );
    }
}

export default new NotificationService();