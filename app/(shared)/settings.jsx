import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Switch } from "react-native";

import InfoPage, { InfoCard, InfoRow } from "../../components/InfoPage";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

export default function Settings() {
  // TODO: dummy settings - kept only on this screen, not saved anywhere yet
  const [notifications, setNotifications] = useState(true);
  const [attendanceReminder, setAttendanceReminder] = useState(true);
  const [sound, setSound] = useState(false);

  const toggle = (value, onChange) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: "#D9DEE7", true: "#F3C9A5" }}
      thumbColor={value ? "#D86A16" : "#f4f3f4"}
    />
  );

  return (
    <InfoPage title="Settings" subtitle="Manage your app preferences">
      <InfoCard title="Notifications">
        <InfoRow
          icon="notifications-none"
          label="Push Notifications"
          value="Updates about tasks and targets"
          right={toggle(notifications, setNotifications)}
        />

        <InfoRow
          icon="alarm"
          label="Attendance Reminder"
          value="Remind me to mark attendance"
          right={toggle(attendanceReminder, setAttendanceReminder)}
        />

        <InfoRow
          icon="volume-up"
          label="Notification Sound"
          value="Play a sound for new alerts"
          right={toggle(sound, setSound)}
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
