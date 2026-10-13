import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import InfoPage, { InfoCard, InfoRow } from "../../components/InfoPage";

const FAQS = [
  {
    question: "I cannot mark my attendance",
    answer:
      "Make sure location permission is allowed for the app and your phone's location is turned on. You also need to be at your assigned work location.",
  },
  {
    question: "I cannot log in",
    answer:
      "Check your employee number and password. If the problem continues, ask your store manager to verify that your account is active.",
  },
  {
    question: "My data is not loading",
    answer:
      "Check your internet connection, then pull down on the screen to refresh. If it still does not load, close the app and open it again.",
  },
  {
    question: "My targets or leads look wrong",
    answer:
      "Pull down to refresh so the latest data is loaded. If the numbers are still incorrect, report it to your store manager.",
  },
  {
    question: "The app is asking for location permission",
    answer:
      "Location is used only for attendance and task tracking during work. Choose Allow so attendance can be recorded correctly.",
  },
  {
    question: "How do I log out?",
    answer: "Open the Profile tab and tap Logout at the bottom of the page.",
  },
];

export default function Help() {
  // index of the question that is open (null = all closed)
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <InfoPage title="Help & Support" subtitle="Answers to common questions">
      <InfoCard title="Frequently Asked Questions">
        {FAQS.map((item, index) => {
          const open = openIndex === index;
          const last = index === FAQS.length - 1;

          return (
            <View
              key={item.question}
              style={[styles.faqItem, !last && styles.faqBorder]}
            >
              <Pressable
                style={styles.faqHeader}
                onPress={() => setOpenIndex(open ? null : index)}
              >
                <Text style={styles.question}>{item.question}</Text>

                <MaterialIcons
                  name={open ? "expand-less" : "expand-more"}
                  size={22}
                  color="#D86A16"
                />
              </Pressable>

              {open && <Text style={styles.answer}>{item.answer}</Text>}
            </View>
          );
        })}
      </InfoCard>

      <InfoCard title="Still Need Help?">
        <InfoRow
          icon="support-agent"
          label="Contact Us"
          value="Call or email the support team"
          onPress={() => router.push("/contact")}
          last
        />
      </InfoCard>
    </InfoPage>
  );
}

const styles = StyleSheet.create({
  faqItem: {
    paddingVertical: 10,
  },
  faqBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  question: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginRight: 8,
  },
  answer: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: "#666",
  },
});
