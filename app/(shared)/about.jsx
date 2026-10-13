import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Linking, StyleSheet, Text, View } from "react-native";

import InfoPage, {
  InfoCard,
  InfoRow,
  InfoText,
} from "../../components/InfoPage";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

const FEATURES = [
  {
    icon: "event-available",
    label: "Attendance",
    value: "Mark check-in and check-out from your work location",
  },
  {
    icon: "flag",
    label: "Targets",
    value: "Track your daily sales targets and progress",
  },
  {
    icon: "people",
    label: "Leads",
    value: "Capture customer leads and follow up on them",
  },
  {
    icon: "school",
    label: "Learning",
    value: "Complete courses and assessments",
  },
  {
    icon: "local-shipping",
    label: "Delivery & Fitting",
    value: "Manage delivery, fitting and shipment tasks",
  },
];

export default function About() {
  return (
    <InfoPage title="About" subtitle="Know more about this app">
      {/* App identity */}
      <View style={styles.hero}>
        <View style={styles.logo}>
          <MaterialIcons name="storefront" size={34} color="#fff" />
        </View>

        <Text style={styles.brand}>
          <Text style={styles.brandHome}>Home</Text>
          <Text style={styles.brandTown}>Town</Text>
          <Text style={styles.brandHome}> OnTrack</Text>
        </Text>

        <Text style={styles.tagline}>Smart Retail Workforce Platform</Text>

        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>Version {APP_VERSION}</Text>
        </View>
      </View>

      <InfoCard title="About the App">
        <InfoText>
          HomeTown OnTrack is the workforce app for HomeTown store, delivery,
          fitter and shipment teams. It brings attendance, targets, leads,
          learning and field tasks together in one place, so every team member
          can stay on top of their day.
        </InfoText>
      </InfoCard>

      <InfoCard title="What You Can Do">
        {FEATURES.map((item, index) => (
          <InfoRow
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={item.value}
            last={index === FEATURES.length - 1}
          />
        ))}
      </InfoCard>

      <InfoCard title="More">
        <InfoRow
          icon="language"
          label="Website"
          value="www.hometown.in"
          onPress={() => Linking.openURL("https://www.hometown.in/")}
        />

        <InfoRow
          icon="privacy-tip"
          label="Privacy Policy"
          onPress={() =>
            Linking.openURL("https://www.hometown.in/pages/app-policy")
          }
          last
        />
      </InfoCard>

      <Text style={styles.footer}>
        © {new Date().getFullYear()} HomeTown. All rights reserved.
      </Text>
    </InfoPage>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 14,
    marginBottom: 10,
    elevation: 2,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "#0F2D52",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "900",
  },
  brandHome: {
    color: "#0F2D52",
  },
  brandTown: {
    color: "#D86A16",
  },
  tagline: {
    marginTop: 3,
    fontSize: 12,
    color: "#777",
  },
  versionBadge: {
    marginTop: 10,
    backgroundColor: "#FFF4EC",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  versionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D86A16",
  },
  footer: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    color: "#9CA3AF",
  },
});
