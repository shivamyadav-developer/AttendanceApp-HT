import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import AppDrawer from "../../components/AppDrawer";
import fitterService, { isFittingCompleted } from "../../services/fitter.service";

// =============================================================
// RESPONSIVE SCALING HELPERS
// =============================================================
const GUIDELINE_BASE_WIDTH = 375; // iPhone-ish reference width

const scale = (size, width) => (width / GUIDELINE_BASE_WIDTH) * size;

const moderateScale = (size, width, factor = 0.5) =>
    size + (scale(size, width) - size) * factor;

export default function FitterDashboard() {
  const { width, height } = useWindowDimensions();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    try {
      setError("");

      const data = await fitterService.getDashboardTasks();

      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(
        "[FitterDashboard] Load error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load fitter dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  // Same status grouping used by website
  const pendingStatuses = [
    "FITTING_AGENT_ASSIGNED",
    "ASSIGNED_TO_FITTER",
    "VISIT_SCHEDULED",
    "FITTING_IN_PROGRESS",
  ];

  const completedStatuses = [
    "FITTING_DONE",
    "RESOLVED",
    "CLOSED",
  ];

  const pendingTasks = tasks.filter((task) =>
    pendingStatuses.includes(task.status)
  );

  const completedTasks = tasks.filter((task) =>
    completedStatuses.includes(task.status)
  );

  const fittingTasks = tasks.filter(
    (task) => task.isFitting === true
  );

  const openTasks = tasks.filter(
    (task) =>
      task.isFitting === true &&
      !isFittingCompleted(task)
  );

  const today = new Date();

  const todayTasks = tasks.filter((task) => {
    const scheduledDate =
      task?.fitting?.scheduledDate;

    if (!scheduledDate) {
      return false;
    }

    const date = new Date(scheduledDate);

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  });

  const openTaskDetails = (task) => {
    if (!task?._id) {
      return;
    }

    router.push({
      pathname: "/(fitter)/fitting-detail",
      params: {
        id: task._id,
      },
    });
  };

  // =============================================================
  // RESPONSIVE STYLES
  // =============================================================
  const isTablet = width >= 768;
  const numColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
  const statCardWidthPct = `${Math.floor(100 / numColumns) - 2}%`;

  const styles = useMemo(
    () => createStyles(width, height, { isTablet, statCardWidthPct }),
    [width, height, isTablet, statCardWidthPct]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D86A16"
        />

        <Text style={styles.loadingText}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.menuBox}>
          <AppDrawer section="fitter" role="Fitter" iconColor="#fff" />
        </View>

        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.smallTitle}>
            FITTER OPERATIONS
          </Text>

          <Text style={styles.title}>
            Fitter Dashboard
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <MaterialIcons
            name="refresh"
            size={moderateScale(24, width)}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#D86A16"]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <MaterialIcons
              name="error-outline"
              size={moderateScale(22, width)}
              color="#C62828"
            />

            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Main Stats */}
        <View style={styles.statsGrid}>
          <StatCard
            styles={styles}
            width={width}
            icon="assignment"
            title="Total Jobs"
            value={tasks.length}
          />

          <StatCard
            styles={styles}
            width={width}
            icon="pending-actions"
            title="Pending"
            value={pendingTasks.length}
          />

          <StatCard
            styles={styles}
            width={width}
            icon="build"
            title="Fitting Jobs"
            value={fittingTasks.length}
          />

          <StatCard
            styles={styles}
            width={width}
            icon="check-circle"
            title="Completed"
            value={completedTasks.length}
          />
        </View>

        {/* Today's Jobs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Today's Jobs
          </Text>

          <Text style={styles.sectionCount}>
            {todayTasks.length}
          </Text>
        </View>

        {todayTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons
              name="event-available"
              size={moderateScale(42, width)}
              color="#B8C8C2"
            />

            <Text style={styles.emptyTitle}>
              No jobs scheduled today
            </Text>

            <Text style={styles.emptyText}>
              You don't have any fitting jobs
              scheduled for today.
            </Text>
          </View>
        ) : (
          todayTasks
            .slice(0, 5)
            .map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                styles={styles}
                width={width}
                onPress={() =>
                  openTaskDetails(task)
                }
              />
            ))
        )}

        {/* Pending Jobs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Pending Fittings
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push(
                "/(fitter)/fittings"
              )
            }
          >
            <Text style={styles.viewAll}>
              View All
            </Text>
          </TouchableOpacity>
        </View>

        {openTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons
              name="check-circle-outline"
              size={moderateScale(42, width)}
              color="#B8C8C2"
            />

            <Text style={styles.emptyTitle}>
              No pending fittings
            </Text>

            <Text style={styles.emptyText}>
              All your current fitting jobs are
              completed.
            </Text>
          </View>
        ) : (
          openTasks
            .slice(0, 5)
            .map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                styles={styles}
                width={width}
                onPress={() =>
                  openTaskDetails(task)
                }
              />
            ))
        )}
      </ScrollView>
    </View>
  );
}

/* -----------------------------------------
   Stat Card
----------------------------------------- */

function StatCard({
  styles,
  width,
  icon,
  title,
  value,
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <MaterialIcons
          name={icon}
          size={moderateScale(24, width)}
          color="#D86A16"
        />
      </View>

      <Text style={styles.statValue}>
        {value}
      </Text>

      <Text style={styles.statTitle}>
        {title}
      </Text>
    </View>
  );
}

/* -----------------------------------------
   Task Card
----------------------------------------- */

function TaskCard({
  task,
  styles,
  width,
  onPress,
}) {
  const customer =
    task.customer || "Customer";

  const ticketNumber =
    task.ticketNumber ||
    task._id ||
    "N/A";

  const productName =
    task.productDetails?.productName ||
    "Product not available";

  const timeSlot =
    task.fitting?.scheduledTimeSlot ||
    "Time not scheduled";

  const status =
    task.status || "UNKNOWN";

  const addressParts = [
    task.serviceAddress?.line1,
    task.serviceAddress?.line2,
    task.serviceAddress?.city,
    task.serviceAddress?.state,
    task.serviceAddress?.pincode,
  ].filter(Boolean);

  const address =
    addressParts.length > 0
      ? addressParts.join(", ")
      : "Address not available";

  return (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.taskTop}>
        <View style={styles.ticketContainer}>
          <MaterialIcons
            name="confirmation-number"
            size={moderateScale(18, width)}
            color="#D86A16"
          />

          <Text style={styles.ticketNumber}>
            {ticketNumber}
          </Text>
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {status.replaceAll("_", " ")}
          </Text>
        </View>
      </View>

      <Text style={styles.customerName}>
        {customer}
      </Text>

      <View style={styles.detailRow}>
        <MaterialIcons
          name="inventory-2"
          size={moderateScale(18, width)}
          color="#71807A"
        />

        <Text
          style={styles.detailText}
          numberOfLines={1}
        >
          {productName}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <MaterialIcons
          name="schedule"
          size={moderateScale(18, width)}
          color="#71807A"
        />

        <Text style={styles.detailText}>
          {timeSlot}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <MaterialIcons
          name="location-on"
          size={moderateScale(18, width)}
          color="#71807A"
        />

        <Text
          style={styles.detailText}
          numberOfLines={2}
        >
          {address}
        </Text>
      </View>

      <View style={styles.openDetails}>
        <Text style={styles.openDetailsText}>
          View Details
        </Text>

        <MaterialIcons
          name="chevron-right"
          size={moderateScale(22, width)}
          color="#D86A16"
        />
      </View>
    </TouchableOpacity>
  );
}

/* -----------------------------------------
   Styles (generated per-dimension so it reflows on rotation/resize)
----------------------------------------- */

function createStyles(width, height, { isTablet, statCardWidthPct }) {
  const ms = (size, factor) => moderateScale(size, width, factor);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#F3EEE8",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F3EEE8",
    },

    loadingText: {
      marginTop: ms(12),
      fontSize: ms(15),
      color: "#66736E",
    },

    header: {
      backgroundColor: "#0F2D52",
      height: 160,
      paddingTop: 50,
      paddingHorizontal: 18,
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    menuBox: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },

    smallTitle: {
      fontSize: ms(10),
      fontWeight: "800",
      letterSpacing: 1.2,
      color: "#F5A623",
    },

    title: {
      marginTop: ms(3),
      fontSize: ms(20, 0.4),
      fontWeight: "bold",
      color: "#FFFFFF",
    },

    refreshButton: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },

    content: {
      padding: ms(16),
      paddingBottom: ms(35),
    },

    contentTablet: {
      maxWidth: 900,
      width: "100%",
      alignSelf: "center",
    },

    errorBox: {
      backgroundColor: "#FFF1F1",
      borderWidth: 1,
      borderColor: "#FFD4D4",
      borderRadius: ms(12),
      padding: ms(14),
      flexDirection: "row",
      alignItems: "center",
      marginBottom: ms(16),
    },

    errorText: {
      flex: 1,
      marginLeft: ms(10),
      fontSize: ms(14),
      color: "#B3261E",
    },

    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: ms(22),
    },

    statCard: {
      width: statCardWidthPct,
      backgroundColor: "#FFFFFF",
      borderRadius: ms(16),
      padding: ms(16),
      marginBottom: ms(12),
      borderWidth: 1,
      borderColor: "#EEE7DE",
    },

    statIcon: {
      width: ms(42),
      height: ms(42),
      borderRadius: ms(12),
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: ms(12),
    },

    statValue: {
      fontSize: ms(26, 0.4),
      fontWeight: "800",
      color: "#0F2D52",
    },

    statTitle: {
      marginTop: ms(3),
      fontSize: ms(13),
      color: "#71807A",
      fontWeight: "600",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: ms(5),
      marginBottom: ms(12),
    },

    sectionTitle: {
      fontSize: ms(19),
      fontWeight: "800",
      color: "#0F2D52",
    },

    sectionCount: {
      minWidth: ms(28),
      height: ms(28),
      borderRadius: ms(14),
      backgroundColor: "#FFF4EC",
      color: "#D86A16",
      textAlign: "center",
      paddingTop: ms(5),
      fontWeight: "800",
    },

    viewAll: {
      fontSize: ms(14),
      fontWeight: "700",
      color: "#D86A16",
    },

    emptyCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: ms(16),
      padding: ms(30),
      alignItems: "center",
      marginBottom: ms(22),
      borderWidth: 1,
      borderColor: "#EEE7DE",
    },

    emptyTitle: {
      marginTop: ms(12),
      fontSize: ms(16),
      fontWeight: "700",
      color: "#26332E",
    },

    emptyText: {
      marginTop: ms(6),
      fontSize: ms(13),
      color: "#7A8782",
      textAlign: "center",
      lineHeight: ms(19),
    },

    taskCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: ms(16),
      padding: ms(16),
      marginBottom: ms(12),
      borderWidth: 1,
      borderColor: "#EEE7DE",
    },

    taskTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    ticketContainer: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    ticketNumber: {
      marginLeft: ms(7),
      fontSize: ms(13),
      fontWeight: "700",
      color: "#D86A16",
    },

    statusBadge: {
      backgroundColor: "#FFF7E5",
      borderRadius: ms(20),
      paddingHorizontal: ms(10),
      paddingVertical: ms(5),
    },

    statusText: {
      fontSize: ms(10),
      fontWeight: "800",
      color: "#A66A00",
    },

    customerName: {
      marginTop: ms(12),
      fontSize: ms(18),
      fontWeight: "800",
      color: "#0F2D52",
    },

    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: ms(9),
    },

    detailText: {
      flex: 1,
      marginLeft: ms(9),
      fontSize: ms(13),
      color: "#68756F",
    },

    openDetails: {
      marginTop: ms(14),
      paddingTop: ms(12),
      borderTopWidth: 1,
      borderTopColor: "#EDF1EF",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
    },

    openDetailsText: {
      fontSize: ms(13),
      fontWeight: "700",
      color: "#D86A16",
    },
  });
}