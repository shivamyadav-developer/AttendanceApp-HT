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
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// Achieved as a % of target (0 when there is no target)
function percentOf(achieved, target) {
  if (!target) return 0;
  return Math.round((achieved / target) * 100);
}

// Green when target met, orange when close, red when far behind
function progressColor(pct) {
  if (pct >= 100) return "#1A8F4C";
  if (pct >= 75) return "#D86A16";
  return "#C0392B";
}

// "2026-10-15" -> "15 Oct, Thu"
function formatDay(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
}

const EMPTY_DASHBOARD = {
  monthlyTarget: 0,
  monthlyAchieved: 0,
  mtdTarget: 0,
  todayDate: null,
  todayTarget: 0,
  todayAchieved: 0,
  todayWeekOff: false,
  yesterdayDate: null,
  yesterdayTarget: 0,
  yesterdayAchieved: 0,
  yesterdayWeekOff: false,
  monthlyData: [],
};

function ProgressBar({ pct }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: progressColor(pct),
          },
        ]}
      />
    </View>
  );
}

// Target vs achieved for a single day (today / yesterday)
function DayCard({ title, date, target, achieved, weekOff, icon, iconBg, iconColor }) {
  const pct = percentOf(achieved, target);

  return (
    <View style={styles.bigCard}>
      <View style={styles.bigCardHeader}>
        <View style={styles.dayCardTitleRow}>
          <View style={[styles.metricIconContainer, { backgroundColor: iconBg, marginBottom: 0 }]}>
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.bigCardTitle}>{title}</Text>
            {!!date && <Text style={styles.dateText}>{formatDay(date)}</Text>}
          </View>
        </View>

        {weekOff ? (
          <View style={styles.weekOffBadge}>
            <Text style={styles.weekOffBadgeText}>WEEK OFF</Text>
          </View>
        ) : (
          <Text style={[styles.pctBadge, { color: progressColor(pct) }]}>
            {pct}%
          </Text>
        )}
      </View>

      <View style={styles.bigCardRow}>
        <View>
          <Text style={styles.metricLabel}>Target</Text>
          <Text style={styles.metricValue}>
            {weekOff ? "—" : formatCurrency(target)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.metricLabel}>Achieved</Text>
          <Text style={styles.metricValue}>{formatCurrency(achieved)}</Text>
        </View>
      </View>

      {!weekOff && <ProgressBar pct={pct} />}
    </View>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [employeeNumber, setEmployeeNumber] = useState(null);
  const [userName, setUserName] = useState("Employee");
  // Badge under the name: login role (e.g. STORE_STAFF → "STORE STAFF")
  const [userRole, setUserRole] = useState("");

  const [data, setData] = useState(EMPTY_DASHBOARD);

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
        const fullFromParts = [parsedData.firstName, parsedData.lastName]
          .filter(Boolean)
          .join(" ");

        const name = parsedData.name ||
          parsedData.fullName ||
          parsedData.displayName ||
          parsedData.employeeName ||
          fullFromParts ||
          "Employee";

        setUserName(name);
        setUserRole(
          String(parsedData.role || parsedData.jobTitle || "")
            .replace(/_/g, " ")
            .toUpperCase()
        );
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

      // Service returns normalized data, or throws with the API's message
      const dashboard = await dashboardService.getEmployeeDashboard();
      setData(dashboard);
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

  const monthlyPct = percentOf(data.monthlyAchieved, data.monthlyTarget);
  const monthlyRemaining = data.monthlyTarget - data.monthlyAchieved;
  const mtdPct = percentOf(data.monthlyAchieved, data.mtdTarget);
  const mtdGap = data.monthlyAchieved - data.mtdTarget;

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <View style={styles.circleLarge} />
        <View style={styles.circleSmall} />

        <View style={styles.profileRow}>
          <View style={styles.menuBox}>
            <AppDrawer section="staff" role="Store Staff" iconColor="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>{userName}</Text>

            <View style={styles.badgeRow}>
              {!!userRole && (
                <View style={styles.staffBadge}>
                  <Text style={styles.staffText}>{userRole}</Text>
                </View>
              )}
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

      <View style={styles.metricsSection}>
        {/* TODAY */}
        <DayCard
          title="Today"
          date={data.todayDate}
          target={data.todayTarget}
          achieved={data.todayAchieved}
          weekOff={data.todayWeekOff}
          iconBg="#ECF3FA"
          iconColor="#4A6FA5"
          icon="today-outline"
        />

        {/* YESTERDAY */}
        <DayCard
          title="Yesterday"
          date={data.yesterdayDate}
          target={data.yesterdayTarget}
          achieved={data.yesterdayAchieved}
          weekOff={data.yesterdayWeekOff}
          iconBg="#FFF5EC"
          iconColor="#D86A16"
          icon="calendar-outline"
        />

        {/* MTD (month to date, including today) */}
        <View style={styles.bigCard}>
          <View style={styles.bigCardHeader}>
            <Text style={styles.bigCardTitle}>Month to Date</Text>
            <Text style={[styles.pctBadge, { color: progressColor(mtdPct) }]}>
              {mtdPct}%
            </Text>
          </View>

          <View style={styles.bigCardRow}>
            <View>
              <Text style={styles.metricLabel}>MTD Target</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(data.mtdTarget)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.metricLabel}>MTD Achieved</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(data.monthlyAchieved)}
              </Text>
            </View>
          </View>

          <ProgressBar pct={mtdPct} />

          <Text
            style={[
              styles.helperText,
              { color: mtdGap >= 0 ? "#1A8F4C" : "#C0392B" },
            ]}
          >
            {mtdGap >= 0
              ? `Ahead by ${formatCurrency(mtdGap)}`
              : `Behind by ${formatCurrency(-mtdGap)}`}
          </Text>
        </View>

        {/* MONTHLY PROGRESS */}
        <View style={styles.bigCard}>
          <View style={styles.bigCardHeader}>
            <Text style={styles.bigCardTitle}>Monthly Progress</Text>
            <Text style={[styles.pctBadge, { color: progressColor(monthlyPct) }]}>
              {monthlyPct}%
            </Text>
          </View>

          <View style={styles.bigCardRow}>
            <View>
              <Text style={styles.metricLabel}>Target</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(data.monthlyTarget)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.metricLabel}>Achieved</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(data.monthlyAchieved)}
              </Text>
            </View>
          </View>

          <ProgressBar pct={monthlyPct} />

          <Text style={styles.helperText}>
            {monthlyRemaining > 0
              ? `${formatCurrency(monthlyRemaining)} left to reach the monthly target`
              : "Monthly target achieved 🎉"}
          </Text>
        </View>

        {/* DAILY BREAKDOWN */}
        {data.monthlyData.length > 0 && (
          <View style={styles.bigCard}>
            <Text style={[styles.bigCardTitle, { marginBottom: 8 }]}>
              Daily Breakdown
            </Text>

            <View style={[styles.dayRow, styles.dayHeaderRow]}>
              <Text style={[styles.dayHeaderText, styles.colDate]}>Date</Text>
              <Text style={[styles.dayHeaderText, styles.colNum]}>Target</Text>
              <Text style={[styles.dayHeaderText, styles.colNum]}>Achieved</Text>
              <Text style={[styles.dayHeaderText, styles.colPct]}>%</Text>
            </View>

            {data.monthlyData.map((day) => {
              const isToday = day.date === data.todayDate;
              const isFuture = !!data.todayDate && day.date > data.todayDate;
              const pct = percentOf(day.achieved, day.target);

              return (
                <View
                  key={day.date}
                  style={[
                    styles.dayRow,
                    isToday && styles.dayRowToday,
                    isFuture && styles.dayRowFuture,
                  ]}
                >
                  <Text style={[styles.dayText, styles.colDate]}>
                    {formatDay(day.date)}
                  </Text>

                  {day.isWeekOff ? (
                    <>
                      <Text style={[styles.weekOffText, styles.colNum]}>
                        Week off
                      </Text>
                      <Text style={[styles.dayText, styles.colNum]}>
                        {day.achieved ? formatCurrency(day.achieved) : "—"}
                      </Text>
                      <Text style={[styles.dayText, styles.colPct]}>—</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.dayText, styles.colNum]}>
                        {formatCurrency(day.target)}
                      </Text>
                      <Text style={[styles.dayText, styles.colNum]}>
                        {isFuture ? "—" : formatCurrency(day.achieved)}
                      </Text>
                      <Text
                        style={[
                          styles.dayText,
                          styles.colPct,
                          !isFuture && { color: progressColor(pct), fontWeight: "700" },
                        ]}
                      >
                        {isFuture ? "—" : `${pct}%`}
                      </Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}
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
  bigCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  bigCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bigCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F2D52",
  },
  bigCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pctBadge: {
    fontSize: 18,
    fontWeight: "800",
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EEF1F5",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  dayCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateText: {
    fontSize: 12,
    color: "#777",
    marginTop: 1,
  },
  weekOffBadge: {
    backgroundColor: "#EEF1F5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  weekOffBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4A6FA5",
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dayHeaderRow: {
    borderBottomColor: "#E5E7EB",
  },
  dayRowToday: {
    backgroundColor: "#FFF5EC",
    borderRadius: 8,
  },
  dayRowFuture: {
    opacity: 0.5,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#666",
  },
  dayText: {
    fontSize: 12,
    color: "#222",
  },
  weekOffText: {
    fontSize: 12,
    color: "#4A6FA5",
    fontWeight: "600",
  },
  colDate: { flex: 1.3 },
  colNum: { flex: 1.2, textAlign: "right" },
  colPct: { flex: 0.7, textAlign: "right" },
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