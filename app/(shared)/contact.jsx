import { MaterialIcons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import InfoPage, {
  InfoCard,
  InfoRow,
  InfoText,
} from "../../components/InfoPage";

const SUPPORT_PHONE = "7208726671";
const SUPPORT_EMAIL = "jay.jadhav@praxisretail.in";
const SUPPORT_HOURS = "10 AM - 6 PM";

// TODO: placeholder office address - replace with the real one
const OFFICE_ADDRESS = "HomeTown Head Office, Mumbai, Maharashtra";

export default function Contact() {
  const callSupport = () =>
    Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`);

  const emailSupport = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`);

  return (
    <InfoPage title="Contact Us" subtitle="We are here to help">
      {/* Quick actions */}
      <View style={styles.actionRow}>
        <Pressable style={styles.actionCard} onPress={callSupport}>
          <View style={[styles.actionIcon, { backgroundColor: "#E8F7EF" }]}>
            <MaterialIcons name="call" size={22} color="#16A34A" />
          </View>

          <Text style={styles.actionTitle}>Call Us</Text>
          <Text style={styles.actionText}>Talk to support</Text>
        </Pressable>

        <Pressable style={styles.actionCard} onPress={emailSupport}>
          <View style={[styles.actionIcon, { backgroundColor: "#FFF4EC" }]}>
            <MaterialIcons name="mail-outline" size={22} color="#D86A16" />
          </View>

          <Text style={styles.actionTitle}>Email Us</Text>
          <Text style={styles.actionText}>Reply in 24 hours</Text>
        </Pressable>
      </View>

      <InfoCard title="Support Details">
        <InfoRow
          icon="call"
          label="Helpline"
          value={SUPPORT_PHONE}
          onPress={callSupport}
        />

        <InfoRow
          icon="mail-outline"
          label="Email"
          value={SUPPORT_EMAIL}
          onPress={emailSupport}
        />

        <InfoRow icon="schedule" label="Availability" value={SUPPORT_HOURS} />

        <InfoRow
          icon="location-on"
          label="Office"
          value={OFFICE_ADDRESS}
          last
        />
      </InfoCard>

      <InfoCard title="Online">
        <InfoRow
          icon="language"
          label="Website"
          value="www.hometown.in"
          onPress={() => Linking.openURL("https://www.hometown.in/")}
          last
        />
      </InfoCard>

      <InfoCard>
        <InfoText>
          For attendance or login issues, please contact your store manager
          first. They can raise a request with the support team on your
          behalf.
        </InfoText>
      </InfoCard>
    </InfoPage>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  actionCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 16,
    elevation: 2,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F2D52",
  },
  actionText: {
    marginTop: 2,
    fontSize: 11,
    color: "#777",
  },
});
