// app/(tabs)/home.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppDrawer from "../../components/AppDrawer";
import dashboardService from "../../services/dashboard.service";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(value || 0);
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [employeeNumber, setEmployeeNumber] = useState(null);
  const [userName, setUserName] = useState("Employee");

  const [data, setData] = useState({
    monthlyTarget: 0,
    monthlyAchieved: 0,
    yesterdayTarget: 0,
    yesterdayAchieved: 0,
  });

  useEffect(() => {
    loadDashboard();
    getUserName();
  }, []);

  const getUserName = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsedData = JSON.parse(userData);
        console.log("User Data:", parsedData);

        // Try different possible field names for the user's name
        const name = parsedData.name ||
          parsedData.fullName ||
          parsedData.displayName ||
          parsedData.employeeName ||
          parsedData.firstName + " " + parsedData.lastName ||
          "Employee";

        setUserName(name);
      }
    } catch (error) {
      console.error("Error getting user name:", error);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const empNum = await AsyncStorage.getItem("employeeNumber");
      setEmployeeNumber(empNum);

      console.log("Current employee number:", empNum);

      if (!empNum) {
        setError("Employee number not found. Please login again.");
        setLoading(false);
        return;
      }

      const response = await dashboardService.getEmployeeDashboard();
      console.log("Dashboard Response:", response);

      if (response && response.success) {
        setData(response.data || {
          monthlyTarget: 0,
          monthlyAchieved: 0,
          yesterdayTarget: 0,
          yesterdayAchieved: 0,
        });
      } else {
        setError(response?.message || "Failed to load dashboard data");
      }
    } catch (error) {
      console.error("Dashboard Error:", error);
      setError(error.message || "Failed to load dashboard. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const retryLoad = () => {
    loadDashboard();
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D86A16" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={50} color="#D86A16" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retryLoad}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <Text style={styles.empInfo}>
          Employee ID: {employeeNumber || "Not available"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <View style={styles.circleLarge} />
        <View style={styles.circleSmall} />

        <View style={styles.profileRow}>
          <View style={styles.menuBox}>
            <AppDrawer role="Store Staff" iconColor="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>{userName}</Text>

            <View style={styles.badgeRow}>
              <View style={styles.staffBadge}>
                <Text style={styles.staffText}>STORE STAFF</Text>
              </View>
              {!!employeeNumber && (
                <View style={[styles.staffBadge, { backgroundColor: '#4A6FA5' }]}>
                  <Text style={styles.staffText}>ID: {employeeNumber}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#D86A16"]} />
        }
      >

      {/* DASHBOARD CARDS */}
      <View style={styles.metricsSection}>
        {/* Row 1 */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#FFF5EC' }]}>
              <Ionicons name="flag-outline" size={20} color="#D86A16" />
            </View>
            <Text style={styles.metricLabel}>Monthly Target</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.monthlyTarget)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#ECF9F0' }]}>
              <Ionicons name="trophy-outline" size={20} color="#1A5C3A" />
            </View>
            <Text style={styles.metricLabel}>Monthly Achieved</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.monthlyAchieved)}
            </Text>
          </View>
        </View>

        {/* Row 2 */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#ECF3FA' }]}>
              <Ionicons name="calendar-outline" size={20} color="#4A6FA5" />
            </View>
            <Text style={styles.metricLabel}>Yesterday Target</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.yesterdayTarget)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconContainer, { backgroundColor: '#FFF5EC' }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#D86A16" />
            </View>
            <Text style={styles.metricLabel}>Yesterday Achieved</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.yesterdayAchieved)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5EFE6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5EFE6",
  },
  loadingText: {
    marginTop: 10,
    color: "#666",
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5EFE6",
    padding: 20,
  },
  errorText: {
    marginTop: 10,
    color: "#D86A16",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 10,
  },
  empInfo: {
    color: "#666",
    fontSize: 12,
    marginTop: 5,
  },
  retryButton: {
    backgroundColor: "#D86A16",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  header: {
    backgroundColor: "#0F2D52",
    height: 160,
    paddingTop: 50,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  circleLarge: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: 35,
    right: -80,
  },
  circleSmall: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: 90,
    right: -30,
  },
  menuBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  greeting: {
    color: "#D5DCE5",
    fontSize: 13,
  },
  name: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 8,
    gap: 6,
  },
  staffBadge: {
    backgroundColor: "#D86A16",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
  },
  staffText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 10,
  },
  metricsSection: {
    marginHorizontal: 14,
    marginTop: 14,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  metricIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F7F9FC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A1A1A",
  },
});