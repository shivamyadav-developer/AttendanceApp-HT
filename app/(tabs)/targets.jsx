// app/(tabs)/targets.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import targetService from "../../services/target.service";

export default function Targets() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [dailyTargets, setDailyTargets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUserAndData();
  }, []);

  const loadUserAndData = async () => {
    try {
      setLoading(true);
      setError(null);

      const userData = await AsyncStorage.getItem("userData");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        await fetchTargetData();
      } else {
        // Try to get just the employee number
        const empNumber = await AsyncStorage.getItem("employeeNumber");
        if (empNumber) {
          setUser({ employeeNumber: empNumber });
          await fetchTargetData();
        } else {
          Alert.alert("Error", "Please login again");
          router.replace("/");
        }
      }
    } catch (error) {
      console.error("Error loading user:", error);
      setError("Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTargetData = async () => {
    try {
      const dailyResult = await targetService.getDailyTargets();
      console.log("Daily targets result:", dailyResult);

      if (dailyResult.success && dailyResult.data) {
        setDailyTargets(dailyResult.data);
        setError(null);
      } else {
        setDailyTargets([]);
        setError(dailyResult.message || "No daily targets found");
      }
    } catch (error) {
      console.error("Error fetching target data:", error);
      setError(error.message || "Failed to fetch targets");
      setDailyTargets([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTargetData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return "₹0";
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toLocaleString()}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusFromProgress = (percentage) => {
    if (percentage >= 100) return "EXCEEDED";
    if (percentage >= 75) return "ACHIEVED";
    if (percentage >= 50) return "ON TRACK";
    if (percentage > 0) return "IN PROGRESS";
    return "NOT STARTED";
  };

  const getStatusColorFromProgress = (percentage) => {
    if (percentage >= 100) return "#1E9E63";
    if (percentage >= 75) return "#123B73";
    if (percentage >= 50) return "#F5A300";
    if (percentage > 0) return "#D96A17";
    return "#9CA3AF";
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D96A17" />
        <Text style={styles.loadingText}>Loading targets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <View style={styles.circleLarge} />
        <View style={styles.circleSmall} />

        <View style={styles.headerRow}>
          <View style={styles.iconBtn}>
            <Ionicons name="flag-outline" size={22} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Targets</Text>
            <Text style={styles.headerSub}>
              Track your daily sales progress
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >

        {/* Daily Targets Section */}
        <View style={styles.dailySection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="today" size={22} color="#0F2D52" />
            <Text style={styles.sectionTitle}>Daily Targets</Text>
          </View>

          {error ? (
            <View style={styles.emptyCard}>
              <Ionicons name="alert-circle-outline" size={48} color="#D96A17" />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchTargetData}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : dailyTargets && dailyTargets.length > 0 ? (
            dailyTargets.map((target) => {
              const progress = target.salesTargetAmount > 0
                ? Math.min(Math.round(((target.targetAchieved || 0) / target.salesTargetAmount) * 100), 100)
                : 0;
              const statusColor = getStatusColorFromProgress(progress);

              return (
                <View key={target._id} style={styles.dailyCard}>
                  <View style={styles.dailyCardHeader}>
                    <View style={styles.dailyDateRow}>
                      <Ionicons name="calendar-outline" size={16} color="#0F2D52" />
                      <Text style={styles.dailyDate}>
                        {formatDate(target.targetDate)}
                      </Text>
                    </View>
                    <View style={[styles.dailyBadge, { backgroundColor: statusColor }]}>
                      <Text style={styles.dailyBadgeText}>{progress}%</Text>
                    </View>
                  </View>

                  <View style={styles.amountRow}>
                    <View style={styles.amountBox}>
                      <Text style={styles.amountLabel}>ACHIEVED</Text>
                      <Text style={styles.amountValue}>
                        {formatCurrency(target.targetAchieved || 0)}
                      </Text>
                    </View>
                    <View style={styles.amountBox}>
                      <Text style={styles.amountLabel}>TARGET</Text>
                      <Text style={styles.amountValue}>
                        {formatCurrency(target.salesTargetAmount || 0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${progress}%`,
                          backgroundColor: statusColor,
                        },
                      ]}
                    />
                  </View>

                  <Text style={[styles.dailyStatus, { color: statusColor }]}>
                    {getStatusFromProgress(progress)}
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No daily targets found</Text>
              <Text style={styles.emptySubText}>
                Daily targets will appear here once assigned
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  loadingText: {
    marginTop: 10,
    color: "#666",
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
  headerRow: {
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
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  headerSub: {
    color: "#D5DCE5",
    fontSize: 13,
    marginTop: 2,
  },
  dailySection: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F2D52",
  },
  dailyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  dailyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  dailyDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dailyDate: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F2D52",
  },
  amountRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  amountBox: {
    flex: 1,
    backgroundColor: "#F7F4F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.8,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#222",
    marginTop: 3,
  },
  dailyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    minWidth: 50,
    alignItems: "center",
  },
  dailyBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  dailyStatus: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  emptyCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 16,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  emptySubText: {
    color: "#D1D5DB",
    fontSize: 12,
    textAlign: "center",
  },
  progressBg: {
    height: 8,
    backgroundColor: "#ECECEC",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  retryButton: {
    backgroundColor: "#D96A17",
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});