import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
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

export default function AppDrawer({ role = "Staff", iconColor = "#222" }) {
  const [visible, setVisible] = useState(false);

  const menuItems = [
    {
      title: "About",
      icon: "info-outline",
      route: "/about",
    },
    {
      title: "Settings",
      icon: "settings",
      route: "/settings",
    },
    {
      title: "Contact Us",
      icon: "support-agent",
      route: "/contact",
    },
    {
      title: "Help & Support",
      icon: "help-outline",
      route: "/help",
    },
  ];

  const openPage = (route) => {
    setVisible(false);
    router.push(route);
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

            {menuItems.map((item) => (
              <Pressable
                key={item.title}
                style={styles.menuItem}
                onPress={() => openPage(item.route)}
              >
                <MaterialIcons
                  name={item.icon}
                  size={23}
                  color="#444"
                />
                <Text style={styles.menuText}>
                  {item.title}
                </Text>
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color="#999"
                />
              </Pressable>
            ))}

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
});