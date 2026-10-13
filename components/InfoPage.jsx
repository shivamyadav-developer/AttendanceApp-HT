import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Page shell with a navy header and back button, used by the drawer pages
export default function InfoPage({ title, subtitle, children }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>

          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 30 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

// White card, with an optional heading
export function InfoCard({ title, children }) {
  return (
    <View style={styles.card}>
      {!!title && <Text style={styles.cardTitle}>{title}</Text>}

      {children}
    </View>
  );
}

// Icon + label (+ value) row. Tappable when onPress is given.
export function InfoRow({ icon, label, value, onPress, right, last }) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[styles.row, !last && styles.rowBorder]}
    >
      <View style={styles.rowIcon}>
        <MaterialIcons name={icon} size={18} color="#D86A16" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>

        {!!value && <Text style={styles.rowValue}>{value}</Text>}
      </View>

      {right ||
        (onPress ? (
          <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
        ) : null)}
    </Wrapper>
  );
}

export function InfoText({ children }) {
  return <Text style={styles.text}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3EEE8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F2D52",
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#D5DCE5",
  },
  content: {
    padding: 14,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F2D52",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFF4EC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  rowValue: {
    marginTop: 2,
    fontSize: 12,
    color: "#777",
  },
  text: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
});
