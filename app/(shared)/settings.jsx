import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Switch } from "react-native";

import InfoPage, { InfoCard, InfoRow } from "../../components/InfoPage";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  updateNotificationSettings,
} from "../../services/notificationSettings";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

export default function Settings() {
  // Saved on the device; notification.service reads these before every alert
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [osBlocked, setOsBlocked] = useState(false);

  useEffect(() => {
    getNotificationSettings().then(setSettings);
  }, []);

  // Re-check phone-level permission whenever the user comes back to this screen
  // (e.g. after allowing notifications in the phone's settings)
  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync()
        .then(({ status }) => setOsBlocked(status !== "granted"))
        .catch(() => {});
    }, [])
  );

  const changeSetting = (key) => async (value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const saved = await updateNotificationSettings({ [key]: value });
    setSettings(saved);
  };

  const toggle = (value, onChange) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: "#D9DEE7", true: "#F3C9A5" }}
      thumbColor={value ? "#D86A16" : "#f4f3f4"}
    />
  );

  const pushDescription = osBlocked
    ? "Blocked in phone settings — tap to allow"
    : settings.pushEnabled
      ? "Auto check-in and check-out alerts"
      : "Off — you won't get check-in/out alerts";

  return (
    <InfoPage title="Settings" subtitle="Manage your app preferences">
      <InfoCard title="Notifications">
        <InfoRow
          icon={settings.pushEnabled ? "notifications-none" : "notifications-off"}
          label="Push Notifications"
          value={pushDescription}
          onPress={osBlocked ? () => Linking.openSettings() : undefined}
          right={toggle(settings.pushEnabled, changeSetting("pushEnabled"))}
          last
        />
      </InfoCard>

      <InfoCard title="Permissions">
        <InfoRow
          icon="location-on"
          label="Location Access"
          value="Required for attendance tracking"
          onPress={() => Linking.openSettings()}
          last
        />
      </InfoCard>

      <InfoCard title="General">
        <InfoRow icon="translate" label="Language" value="English" />

        <InfoRow
          icon="privacy-tip"
          label="Privacy Policy"
          onPress={() =>
            Linking.openURL("https://www.hometown.in/pages/app-policy")
          }
        />

        <InfoRow
          icon="help-outline"
          label="Help & Support"
          onPress={() => router.push("/help")}
        />

        <InfoRow
          icon="info-outline"
          label="App Version"
          value={APP_VERSION}
          last
        />
      </InfoCard>
    </InfoPage>
  );
}
