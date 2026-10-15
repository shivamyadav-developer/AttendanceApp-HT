import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import attendanceService from "../services/attendance.service";

const PRIVACY_POLICY_URL =
  "https://www.hometown.in/pages/app-policy";

// In-app info pages (moved here from the drawer)
const INFO_PAGES = [
  { label: "About", icon: "info-outline", route: "/about" },
  { label: "Settings", icon: "settings", route: "/settings" },
  { label: "Contact Us", icon: "support-agent", route: "/contact" },
  { label: "Help & Support", icon: "help-outline", route: "/help" },
];

export default function ProfileSettings({ role }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem("userData");

      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } else {
        router.replace("/");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacyPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);

      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        Alert.alert(
          "Unable to open Privacy Policy",
          "Please try again later."
        );
      }
    } catch (error) {
      console.log("Privacy Policy error:", error);

      Alert.alert(
        "Unable to open Privacy Policy",
        "Please try again later."
      );
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              attendanceService.clearAll();

              try {
                const locationService =
                  require("../services/location.service").default;

                await locationService?.stopAllTracking?.();
              } catch (e) {
                console.log("Location cleanup error:", e);
              }

              await AsyncStorage.multiRemove([
                "role",
                "userToken",
                "userData",
                "savedCredentials",
                "employeeNumber",
              ]);

              router.replace("/");
            } catch (error) {
              console.log("Logout error:", error);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);

    if (isNaN(date)) return "N/A";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getInitials = (name) => {
    if (!name) return "U";

    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleName = () => {
    if (role) {
      return role.toUpperCase();
    }

    const jobTitle = user?.jobTitle || user?.role || "";

    if (jobTitle) {
      return jobTitle.toUpperCase();
    }

    return "EMPLOYEE";
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D96A17" />
      </View>
    );
  }

  const isActive = user?.isActive !== false;
  const hasExited = !!user?.exitDate;

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(user?.name)}
          </Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name || "N/A"}
          </Text>

          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {getRoleName()}
              </Text>
            </View>

            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isActive
                      ? "#2ECC71"
                      : "#C0392B",
                  },
                ]}
              />

              <Text style={styles.statusText}>
                {isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      >
      {/* Store & Manager */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Store & Manager
        </Text>

        <InfoRow
          icon="storefront-outline"
          label="STORE"
          value={
            user?.location ||
            user?.employeeLocationSAP ||
            "N/A"
          }
        />

        <InfoRow
          icon="location-outline"
          label="STORE CODE · REGION"
          value={`${user?.siteCode || "N/A"} · ${
            user?.city || "N/A"
          }`}
        />

        <InfoRow
          icon="business-outline"
          label="CITY · STATE"
          value={`${user?.city || "N/A"} · ${
            user?.state || "N/A"
          }`}
        />

        <InfoRow
          icon="people-outline"
          label="REPORTING MANAGER"
          value={user?.reportingTo || "N/A"}
        />

        <InfoRow
          icon="card-outline"
          label="MANAGER EMP. NO."
          value={
            user?.reportingManagerEmployeeNumber ||
            "N/A"
          }
        />
      </View>

      {/* Employee Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Employee Details
        </Text>

        <InfoRow
          icon="card-outline"
          label="EMPLOYEE CODE"
          value={
            user?.employeeNumber ||
            user?._id ||
            "N/A"
          }
        />

        <InfoRow
          icon="call-outline"
          label="MOBILE"
          value={
            user?.phone?.toString() || "N/A"
          }
        />

        <InfoRow
          icon="mail-outline"
          label="EMAIL"
          value={user?.email || "N/A"}
        />

        <InfoRow
          icon="business-outline"
          label="DEPARTMENT"
          value={user?.department || "N/A"}
        />

        <InfoRow
          icon="layers-outline"
          label="DEPARTMENT CATEGORY"
          value={
            user?.departmentCategory || "N/A"
          }
        />

        <InfoRow
          icon="briefcase-outline"
          label="DESIGNATION"
          value={
            user?.jobTitle ||
            user?.role ||
            "N/A"
          }
        />

        <InfoRow
          icon="calendar-outline"
          label="JOINING DATE"
          value={formatDate(user?.dateJoined)}
        />

        {hasExited && (
          <InfoRow
            icon="calendar-outline"
            label="EXIT DATE"
            value={formatDate(user?.exitDate)}
          />
        )}
      </View>

      {/* Additional Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Additional Information
        </Text>

        <InfoRow
          icon="location-outline"
          label="LOCATION"
          value={
            user?.employeeLocationSAP ||
            user?.location ||
            "N/A"
          }
        />

        <InfoRow
          icon="trending-up-outline"
          label="BAND"
          value={user?.band || "N/A"}
        />

        <InfoRow
          icon="person-outline"
          label="WORKER TYPE"
          value={user?.workerType || "N/A"}
        />

        <InfoRow
          icon="checkmark-circle-outline"
          label="EMPLOYMENT STATUS"
          value={
            user?.employmentStatus || "N/A"
          }
        />

        <InfoRow
          icon="home-outline"
          label="FORMAT"
          value={user?.format || "N/A"}
        />

        <InfoRow
          icon="layers-outline"
          label="SUB FORMAT"
          value={user?.subFormat || "N/A"}
        />

        <InfoRow
          icon="apps-outline"
          label="FUNCTIONS"
          value={user?.functions || "N/A"}
        />

        <InfoRow
          icon="options-outline"
          label="SUB FUNCTION"
          value={
            user?.subFunction || "N/A"
          }
        />

        <InfoRow
          icon="map-outline"
          label="EMPLOYEE ZONE"
          value={
            user?.employeeZone || "N/A"
          }
        />

        <InfoRow
          icon="cash-outline"
          label="COST CENTER NO"
          value={
            user?.costCenterNo || "N/A"
          }
        />

        <InfoRow
          icon="document-text-outline"
          label="COST CENTER DESCRIPTION"
          value={
            user?.costCenterDescription ||
            "N/A"
          }
        />

        <InfoRow
          icon="pricetag-outline"
          label="PROFIT CENTRE"
          value={
            user?.profitCentre || "N/A"
          }
        />
      </View>

      {/* Help & Information — same card/row styling as the cards above */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Help & Information
        </Text>

        {/* ABOUT / SETTINGS / CONTACT US / HELP & SUPPORT */}
        {INFO_PAGES.map((page) => (
          <LinkRow
            key={page.route}
            icon={page.icon}
            label={page.label}
            onPress={() => router.push(page.route)}
          />
        ))}

        {/* PRIVACY POLICY (opens the website) */}
        <LinkRow
          icon="privacy-tip"
          label="Privacy Policy"
          external
          onPress={handlePrivacyPolicy}
        />
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
      >
        <MaterialIcons
          name="logout"
          size={20}
          color="#fff"
        />

        <Text style={styles.logoutText}>
          Logout
        </Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// Tappable row that matches InfoRow's size and spacing
function LinkRow({ icon, label, onPress, external = false }) {
  return (
    <TouchableOpacity
      style={styles.linkRow}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.iconBox, styles.linkIconBox]}>
        <MaterialIcons
          name={icon}
          size={17}
          color="#0F2D52"
        />
      </View>

      <Text style={[styles.infoLabel, styles.linkLabel]}>
        {label.toUpperCase()}
      </Text>

      <MaterialIcons
        name={external ? "open-in-new" : "chevron-right"}
        size={external ? 17 : 22}
        color="#9CA3AF"
      />
    </TouchableOpacity>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.iconBox}>
        <Ionicons
          name={icon}
          size={17}
          color="#0F2D52"
        />
      </View>

      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
        {value || "N/A"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3EEE8",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3EEE8",
  },

  header: {
    backgroundColor: "#0F2D52",
    flexDirection: "row",
    alignItems: "center",
    height: 160,
    paddingTop: 50,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  headerInfo: {
    flex: 1,
    marginLeft: 14,
  },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#E67821",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },

  name: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },

  roleBadge: {
    backgroundColor: "#E67821",
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
  },

  roleBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 14,
    marginTop: 9,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    elevation: 2,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0F2D52",
    marginBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 6,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
    flexWrap: "wrap",
  },

  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: "#EEF3F8",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  infoLabel: {
    fontSize: 13,
    color: "#666",
    width: 125,
    fontWeight: "500",
  },

  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    flex: 1,
    textAlign: "right",
  },

  // infoLabel has a fixed width for label/value rows; link rows fill the line
  linkLabel: {
    flex: 1,
    width: undefined,
    color: "#374151",
    fontWeight: "600",
  },

  // Each Help & Information item is its own bordered tile
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff", // same white as the cards
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },

  // Light-blue icon box, same as the rows in the cards above
  linkIconBox: {
    backgroundColor: "#EEF3F8",
  },

  rowBorder: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#C0392B",
    marginHorizontal: 14,
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 12,
    elevation: 2,
  },

  logoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});