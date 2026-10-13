import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import fitterService from "../../services/fitter.service";

// =============================================================
// RESPONSIVE SCALING HELPERS
// =============================================================
const GUIDELINE_BASE_WIDTH = 375; // iPhone-ish reference width

const scale = (size, width) => (width / GUIDELINE_BASE_WIDTH) * size;

const moderateScale = (size, width, factor = 0.5) =>
    size + (scale(size, width) - size) * factor;

export default function Fittings() {
  const { width, height } = useWindowDimensions();

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTasks = async () => {
    try {
      setError("");

      const data = await fitterService.getPendingTasks();

      const taskList = Array.isArray(data) ? data : [];

      setTasks(taskList);
      setFilteredTasks(taskList);
    } catch (err) {
      console.error(
        "[Fittings] Load error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load fitting jobs."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadTasks();
  };

  const handleSearch = (text) => {
    setSearch(text);

    const value = text.trim().toLowerCase();

    if (!value) {
      setFilteredTasks(tasks);
      return;
    }

    const filtered = tasks.filter((task) => {
      const ticketNumber =
        String(task.ticketNumber || "")
          .toLowerCase();

      const customer =
        String(task.customer || "")
          .toLowerCase();

      const orderId =
        String(
          task.productDetails?.orderId || ""
        ).toLowerCase();

      const phone =
        String(task.customerMobile || "")
          .toLowerCase();

      return (
        ticketNumber.includes(value) ||
        customer.includes(value) ||
        orderId.includes(value) ||
        phone.includes(value)
      );
    });

    setFilteredTasks(filtered);
  };

  const openTask = (task) => {
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
  const numColumns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;

  const styles = useMemo(
    () => createStyles(width, height, { isTablet, numColumns }),
    [width, height, isTablet, numColumns]
  );

  const renderTask = ({ item }) => {
    return (
      <FittingCard
        task={item}
        styles={styles}
        width={width}
        numColumns={numColumns}
        onPress={() => openTask(item)}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D86A16"
        />

        <Text style={styles.loadingText}>
          Loading fitting jobs...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.smallTitle}>
          FITTING OPERATIONS
        </Text>

        <Text style={styles.title}>
          My Fittings
        </Text>

        <Text style={styles.subtitle}>
          {filteredTasks.length} pending job
          {filteredTasks.length !== 1
            ? "s"
            : ""}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <MaterialIcons
          name="search"
          size={moderateScale(23, width)}
          color="#8A9791"
        />

        <TextInput
          value={search}
          onChangeText={handleSearch}
          placeholder="Search ticket, customer, order..."
          placeholderTextColor="#9AA6A1"
          style={styles.searchInput}
        />

        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => handleSearch("")}
          >
            <MaterialIcons
              name="close"
              size={moderateScale(21, width)}
              color="#7D8984"
            />
          </TouchableOpacity>
        )}
      </View>

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

      {/* Jobs */}
      <FlatList
        data={filteredTasks}
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={
          numColumns > 1 ? styles.columnWrapper : undefined
        }
        keyExtractor={(item, index) =>
          String(item?._id || index)
        }
        renderItem={renderTask}
        contentContainerStyle={[
          styles.list,
          filteredTasks.length === 0 &&
            styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#D86A16"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <MaterialIcons
                name="build"
                size={moderateScale(42, width)}
                color="#AEBDB6"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No fitting jobs found
            </Text>

            <Text style={styles.emptyText}>
              {search
                ? "Try another search."
                : "You currently have no pending fitting jobs assigned to you."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

/* -----------------------------------------
   Fitting Card
----------------------------------------- */

function FittingCard({
  task,
  styles,
  width,
  numColumns,
  onPress,
}) {
  const ticketNumber =
    task.ticketNumber ||
    task._id ||
    "N/A";

  const customer =
    task.customer || "Customer";

  const orderId =
    task.productDetails?.orderId ||
    "N/A";

  const productName =
    task.productDetails?.productName ||
    "Product not available";

  const productCode =
    task.productDetails?.productCode ||
    "";

  const mobile =
    task.customerMobile ||
    "No mobile number";

  const scheduledDate =
    formatDate(
      task.fitting?.scheduledDate
    );

  const timeSlot =
    task.fitting?.scheduledTimeSlot ||
    "Time not scheduled";

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
      style={[
        styles.card,
        numColumns > 1 && styles.cardGrid,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Ticket + Status */}
      <View style={styles.cardHeader}>
        <View style={styles.ticketRow}>
          <MaterialIcons
            name="confirmation-number"
            size={moderateScale(19, width)}
            color="#D86A16"
          />

          <Text style={styles.ticketNumber}>
            {ticketNumber}
          </Text>
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {formatStatus(task.status)}
          </Text>
        </View>
      </View>

      {/* Customer */}
      <Text style={styles.customer}>
        {customer}
      </Text>

      {/* Product */}
      <View style={styles.detailRow}>
        <MaterialIcons
          name="inventory-2"
          size={moderateScale(19, width)}
          color="#73817B"
        />

        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>
            Product
          </Text>

          <Text
            style={styles.detailValue}
            numberOfLines={2}
          >
            {productName}
            {productCode
              ? ` (${productCode})`
              : ""}
          </Text>
        </View>
      </View>

      {/* Order */}
      <View style={styles.detailRow}>
        <MaterialIcons
          name="receipt-long"
          size={moderateScale(19, width)}
          color="#73817B"
        />

        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>
            Order ID
          </Text>

          <Text style={styles.detailValue}>
            {orderId}
          </Text>
        </View>
      </View>

      {/* Customer Phone */}
      <View style={styles.detailRow}>
        <MaterialIcons
          name="phone"
          size={moderateScale(19, width)}
          color="#73817B"
        />

        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>
            Customer
          </Text>

          <Text style={styles.detailValue}>
            {mobile}
          </Text>
        </View>
      </View>

      {/* Schedule */}
      <View style={styles.scheduleBox}>
        <View style={styles.scheduleItem}>
          <MaterialIcons
            name="calendar-today"
            size={moderateScale(18, width)}
            color="#D86A16"
          />

          <View>
            <Text style={styles.scheduleLabel}>
              Scheduled Date
            </Text>

            <Text style={styles.scheduleValue}>
              {scheduledDate}
            </Text>
          </View>
        </View>

        <View style={styles.scheduleItem}>
          <MaterialIcons
            name="schedule"
            size={moderateScale(19, width)}
            color="#D86A16"
          />

          <View>
            <Text style={styles.scheduleLabel}>
              Time Slot
            </Text>

            <Text style={styles.scheduleValue}>
              {timeSlot}
            </Text>
          </View>
        </View>
      </View>

      {/* Address */}
      <View style={styles.addressRow}>
        <MaterialIcons
          name="location-on"
          size={moderateScale(20, width)}
          color="#73817B"
        />

        <Text
          style={styles.addressText}
          numberOfLines={3}
        >
          {address}
        </Text>
      </View>

      {/* View */}
      <View style={styles.viewDetails}>
        <Text style={styles.viewDetailsText}>
          View Fitting Details
        </Text>

        <MaterialIcons
          name="arrow-forward"
          size={moderateScale(20, width)}
          color="#D86A16"
        />
      </View>
    </TouchableOpacity>
  );
}

/* -----------------------------------------
   Helpers
----------------------------------------- */

function formatDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function formatStatus(status) {
  if (!status) {
    return "UNKNOWN";
  }

  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

/* -----------------------------------------
   Styles (generated per-dimension so it reflows on rotation/resize)
----------------------------------------- */

function createStyles(width, height, { isTablet, numColumns }) {
  const ms = (size, factor) => moderateScale(size, width, factor);
  const cardGap = ms(13);
  // For multi-column grid, each card takes a fraction of width minus the gap
  const cardGridWidth =
    numColumns > 1
      ? `${Math.floor(100 / numColumns) - 2}%`
      : "100%";

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
      color: "#68756F",
      fontSize: ms(15),
    },

    header: {
      backgroundColor: "#0F2D52",
      height: 160,
      paddingTop: 50,
      paddingHorizontal: 18,
      justifyContent: "center",
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
    },

    smallTitle: {
      fontSize: ms(10),
      fontWeight: "800",
      letterSpacing: 1.2,
      color: "#F5A623",
    },

    title: {
      marginTop: ms(3),
      fontSize: ms(22, 0.4),
      fontWeight: "bold",
      color: "#FFFFFF",
    },

    subtitle: {
      marginTop: ms(3),
      fontSize: ms(12),
      color: "#D5DCE5",
    },

    searchContainer: {
      margin: ms(16),
      backgroundColor: "#FFFFFF",
      borderRadius: ms(14),
      borderWidth: 1,
      borderColor: "#E0E8E4",
      minHeight: ms(50),
      paddingHorizontal: ms(14),
      flexDirection: "row",
      alignItems: "center",
      maxWidth: isTablet ? 500 : undefined,
      width: isTablet ? "100%" : undefined,
      alignSelf: isTablet ? "center" : undefined,
    },

    searchInput: {
      flex: 1,
      marginLeft: ms(9),
      fontSize: ms(14),
      color: "#26332E",
    },

    errorBox: {
      marginHorizontal: ms(16),
      marginBottom: ms(12),
      backgroundColor: "#FFF1F1",
      borderWidth: 1,
      borderColor: "#FFD4D4",
      borderRadius: ms(12),
      padding: ms(13),
      flexDirection: "row",
      alignItems: "center",
    },

    errorText: {
      flex: 1,
      marginLeft: ms(9),
      color: "#B3261E",
      fontSize: ms(13),
    },

    list: {
      paddingHorizontal: ms(16),
      paddingBottom: ms(30),
      maxWidth: isTablet ? 1100 : undefined,
      width: isTablet ? "100%" : undefined,
      alignSelf: isTablet ? "center" : undefined,
    },

    emptyList: {
      flexGrow: 1,
      justifyContent: "center",
    },

    columnWrapper: {
      justifyContent: "space-between",
      gap: cardGap,
    },

    emptyContainer: {
      alignItems: "center",
      paddingHorizontal: ms(30),
    },

    emptyIcon: {
      width: ms(78),
      height: ms(78),
      borderRadius: ms(39),
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      marginTop: ms(15),
      fontSize: ms(18),
      fontWeight: "800",
      color: "#26332E",
    },

    emptyText: {
      marginTop: ms(7),
      fontSize: ms(13),
      lineHeight: ms(19),
      color: "#7B8782",
      textAlign: "center",
    },

    card: {
      backgroundColor: "#FFFFFF",
      borderRadius: ms(17),
      padding: ms(16),
      marginBottom: ms(13),
      borderWidth: 1,
      borderColor: "#E1E9E5",
      width: "100%",
    },

    cardGrid: {
      width: cardGridWidth,
    },

    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    ticketRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    ticketNumber: {
      marginLeft: ms(7),
      fontSize: ms(13),
      fontWeight: "800",
      color: "#D86A16",
    },

    statusBadge: {
      backgroundColor: "#FFF5DC",
      borderRadius: ms(20),
      paddingHorizontal: ms(10),
      paddingVertical: ms(5),
    },

    statusText: {
      fontSize: ms(10),
      fontWeight: "800",
      color: "#9A6800",
    },

    customer: {
      marginTop: ms(13),
      fontSize: ms(19),
      fontWeight: "800",
      color: "#0F2D52",
    },

    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: ms(13),
    },

    detailContent: {
      flex: 1,
      marginLeft: ms(10),
    },

    detailLabel: {
      fontSize: ms(11),
      color: "#8A9691",
      fontWeight: "600",
    },

    detailValue: {
      marginTop: ms(2),
      fontSize: ms(14),
      color: "#35423D",
      fontWeight: "600",
    },

    scheduleBox: {
      marginTop: ms(15),
      padding: ms(12),
      borderRadius: ms(12),
      backgroundColor: "#FFF4EC",
      flexDirection: "row",
      justifyContent: "space-between",
    },

    scheduleItem: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    scheduleLabel: {
      marginLeft: ms(8),
      fontSize: ms(10),
      color: "#6F7D77",
    },

    scheduleValue: {
      marginLeft: ms(8),
      marginTop: ms(2),
      fontSize: ms(12),
      fontWeight: "700",
      color: "#263B33",
    },

    addressRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: ms(14),
    },

    addressText: {
      flex: 1,
      marginLeft: ms(9),
      fontSize: ms(13),
      lineHeight: ms(19),
      color: "#68756F",
    },

    viewDetails: {
      marginTop: ms(15),
      paddingTop: ms(12),
      borderTopWidth: 1,
      borderTopColor: "#EDF1EF",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    },

    viewDetailsText: {
      marginRight: ms(5),
      fontSize: ms(13),
      fontWeight: "800",
      color: "#D86A16",
    },
  });
}