import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ICON_SETS = {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
};

// Drawer entries = the bottom tabs of each section.
// Keep title / icon in sync with app/<section>/_layout.jsx.
const TAB_MENUS = {
  staff: {
    group: "(tabs)",
    items: [
      { name: "home", title: "Target", set: "MaterialCommunityIcons", icon: "bullseye-arrow" },
      { name: "leaderboard", title: "Leaderboard", set: "MaterialCommunityIcons", icon: "crown-outline" },
      { name: "attend", title: "Attend", set: "Ionicons", icon: "finger-print-outline" },
      { name: "LMS", title: "LMS", set: "Ionicons", icon: "school-outline" },
      { name: "lead", title: "Lead", set: "Ionicons", icon: "people-outline" },
      { name: "barcode", title: "NewLead", set: "Ionicons", icon: "qr-code-outline" },
      { name: "profile", title: "Profile", set: "Ionicons", icon: "person-circle-outline" },
    ],
  },
  fitter: {
    group: "(fitter)",
    items: [
      { name: "attendance", title: "Attend", set: "Ionicons", icon: "finger-print-outline" },
      { name: "dashboard", title: "Home", set: "Ionicons", icon: "home" },
      { name: "fittings", title: "Fittings", set: "MaterialCommunityIcons", icon: "toolbox" },
      { name: "completed-fittings", title: "Completed", set: "MaterialCommunityIcons", icon: "clipboard-check" },
      { name: "tracking", title: "Tracking", set: "MaterialCommunityIcons", icon: "map-marker-radius" },
      { name: "profile", title: "Profile", set: "Ionicons", icon: "person-circle-outline" },
    ],
  },
  delivery: {
    group: "(delivery)",
    items: [
      { name: "dashboard", title: "Dashboard", set: "MaterialIcons", icon: "dashboard" },
      { name: "attendance", title: "Attendance", set: "MaterialIcons", icon: "event-available" },
      { name: "deliveries", title: "Deliveries", set: "MaterialIcons", icon: "local-shipping" },
      { name: "tracking", title: "Tracking", set: "MaterialIcons", icon: "local-shipping" },
      { name: "profile", title: "Profile", set: "MaterialIcons", icon: "person" },
    ],
  },
  shipment: {
    group: "(shipment)",
    items: [
      { name: "new-trip", title: "New Trip", set: "MaterialIcons", icon: "local-shipping" },
      { name: "doc-upload", title: "Doc Upload", set: "MaterialIcons", icon: "description" },
      { name: "vehicle-pic", title: "Vehicle Pic", set: "MaterialIcons", icon: "photo-camera" },
      { name: "trip-status", title: "Trip Status", set: "MaterialIcons", icon: "check-circle" },
      { name: "profile", title: "Profile", set: "MaterialIcons", icon: "person" },
    ],
  },
};

export default function AppDrawer({
  section = "staff",
  role = "Staff",
  iconColor = "#222",
}) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  const menu = TAB_MENUS[section] || TAB_MENUS.staff;

  // Switch to the tab (same as tapping it in the bottom bar)
  const openTab = (name) => {
    setVisible(false);
    router.navigate(`/${menu.group}/${name}`);
  };

  return (
    <>
      {/* Drawer button: place this at the top of the first screen */}
      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
        style={styles.menuButton}
      >
        <MaterialIcons name="menu" size={28} color={iconColor} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback
            onPress={() => setVisible(false)}
          >
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>

          <SafeAreaView style={styles.drawer}>
            <View style={styles.header}>
              <View style={styles.avatar}>
                <MaterialIcons
                  name="account-circle"
                  size={44}
                  color="#1565C0"
                />
              </View>

              <View style={styles.headerText}>
                <Text style={styles.appName}>HT Attendance</Text>
                <Text style={styles.role}>{role}</Text>
              </View>

              <Pressable
                onPress={() => setVisible(false)}
                accessibilityLabel="Close navigation menu"
              >
                <MaterialIcons
                  name="close"
                  size={26}
                  color="#555"
                />
              </Pressable>
            </View>

            <View style={styles.divider} />

            {menu.items.map((item) => {
              const Icon = ICON_SETS[item.set] || MaterialIcons;
              // usePathname drops the (group), e.g. "/fittings"
              const isActive = pathname === `/${item.name}`;

              return (
                <Pressable
                  key={item.name}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => openTab(item.name)}
                >
                  <Icon
                    name={item.icon}
                    size={23}
                    color={isActive ? "#D96A17" : "#444"}
                  />
                  <Text
                    style={[styles.menuText, isActive && styles.menuTextActive]}
                  >
                    {item.title}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color="#999"
                  />
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            {/* <Pressable
              style={styles.menuItem}
              onPress={() => setVisible(false)}
            >
              <MaterialIcons
                name="close"
                size={23}
                color="#666"
              />
              <Text style={styles.menuText}>Close Menu</Text>
            </Pressable> */}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
    width: "82%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 12,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
  },
  avatar: {
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  appName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
  },
  role: {
    fontSize: 13,
    color: "#777",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#EEEEEE",
    marginVertical: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    gap: 14,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  menuItemActive: {
    backgroundColor: "#FFF4EC",
    borderRadius: 10,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  menuTextActive: {
    color: "#D96A17",
    fontWeight: "700",
  },
});