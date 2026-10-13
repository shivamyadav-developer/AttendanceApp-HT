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
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import fitterService from "../../services/fitter.service";

/* -----------------------------------------
   Responsive scaling helpers
   Base width = a standard 390px phone (iPhone 13/14 class).
   Ratio is clamped so things don't blow up on tablets or
   shrink too much on small phones.
----------------------------------------- */

const BASE_WIDTH = 390;

function makeScaler(width) {
  const rawRatio = width / BASE_WIDTH;
  const ratio = Math.min(Math.max(rawRatio, 0.85), 1.3);

  const scale = (size) => size * ratio;

  const moderateScale = (size, factor = 0.4) =>
    size + (scale(size) - size) * factor;

  return { scale, moderateScale };
}

export default function CompletedFittings() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= 700;
  const isNarrow = width < 340;
  const numColumns = width >= 900 ? 2 : 1;

  const styles = useMemo(
    () => createStyles(width, insets, isTablet),
    [width, insets, isTablet]
  );

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTasks = async () => {
    try {
      setError("");

      const data =
        await fitterService.getCompletedTasks();

      const taskList = Array.isArray(data)
        ? data
        : [];

      setTasks(taskList);
      setFilteredTasks(taskList);
    } catch (err) {
      console.error(
        "[CompletedFittings] Load error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load completed fittings."
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#D86A16"
        />

        <Text style={styles.loadingText}>
          Loading completed fittings...
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
          Completed Fittings
        </Text>

        <Text style={styles.subtitle}>
          {filteredTasks.length} completed job
          {filteredTasks.length !== 1
            ? "s"
            : ""}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchOuter}>
        <View style={styles.searchContainer}>
          <MaterialIcons
            name="search"
            size={23}
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
                size={21}
                color="#7D8984"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <MaterialIcons
            name="error-outline"
            size={22}
            color="#C62828"
          />

          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      {/* Completed Jobs */}
      <FlatList
        data={filteredTasks}
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={
          numColumns > 1
            ? styles.columnWrapper
            : undefined
        }
        keyExtractor={(item, index) =>
          String(item?._id || index)
        }
        renderItem={({ item }) => (
          <CompletedFittingCard
            task={item}
            onPress={() => openTask(item)}
            styles={styles}
            isNarrow={isNarrow}
            fullWidth={numColumns === 1}
          />
        )}
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
                name="check-circle"
                size={44}
                color="#D86A16"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No completed fittings
            </Text>

            <Text style={styles.emptyText}>
              {search
                ? "Try another search."
                : "You don't have any completed fitting jobs yet."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function CompletedFittingCard({
  task,
  onPress,
  styles,
  isNarrow,
  fullWidth,
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

  const completedDate =
    formatDate(task.updatedAt);

  const timeSlot =
    task.fitting?.scheduledTimeSlot ||
    "Time not available";

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
        !fullWidth && styles.cardHalf,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Ticket + Completed */}
      <View style={styles.cardHeader}>
        <View style={styles.ticketRow}>
          <MaterialIcons
            name="confirmation-number"
            size={19}
            color="#D86A16"
          />

          <Text
            style={styles.ticketNumber}
            numberOfLines={1}
          >
            {ticketNumber}
          </Text>
        </View>

        <View style={styles.completedBadge}>
          <MaterialIcons
            name="check-circle"
            size={14}
            color="#087A4A"
          />

          <Text style={styles.completedText}>
            COMPLETED
          </Text>
        </View>
      </View>

      {/* Customer */}
      <Text style={styles.customer} numberOfLines={1}>
        {customer}
      </Text>

      {/* Product */}
      <View style={styles.detailRow}>
        <MaterialIcons
          name="inventory-2"
          size={19}
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
          size={19}
          color="#73817B"
        />

        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>
            Order ID
          </Text>

          <Text style={styles.detailValue} numberOfLines={1}>
            {orderId}
          </Text>
        </View>
      </View>

      {/* Customer phone */}
      <View style={styles.detailRow}>
        <MaterialIcons
          name="phone"
          size={19}
          color="#73817B"
        />

        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>
            Customer
          </Text>

          <Text style={styles.detailValue} numberOfLines={1}>
            {mobile}
          </Text>
        </View>
      </View>

      {/* Completion info */}
      <View
        style={[
          styles.completedBox,
          isNarrow && styles.completedBoxStacked,
        ]}
      >
        <View style={styles.completedItem}>
          <MaterialIcons
            name="event"
            size={18}
            color="#D86A16"
          />

          <View style={styles.completedTextWrap}>
            <Text style={styles.completedLabel}>
              Completed
            </Text>

            <Text
              style={styles.completedValue}
              numberOfLines={1}
            >
              {completedDate}
            </Text>
          </View>
        </View>

        <View style={styles.completedItem}>
          <MaterialIcons
            name="schedule"
            size={18}
            color="#D86A16"
          />

          <View style={styles.completedTextWrap}>
            <Text style={styles.completedLabel}>
              Time Slot
            </Text>

            <Text
              style={styles.completedValue}
              numberOfLines={1}
            >
              {timeSlot}
            </Text>
          </View>
        </View>
      </View>

      {/* Address */}
      <View style={styles.addressRow}>
        <MaterialIcons
          name="location-on"
          size={20}
          color="#73817B"
        />

        <Text
          style={styles.addressText}
          numberOfLines={3}
        >
          {address}
        </Text>
      </View>

      {/* Details */}
      <View style={styles.viewDetails}>
        <Text style={styles.viewDetailsText}>
          View Fitting Details
        </Text>

        <MaterialIcons
          name="arrow-forward"
          size={20}
          color="#D86A16"
        />
      </View>
    </TouchableOpacity>
  );
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
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

/* -----------------------------------------
   Styles (responsive)
   Regenerated whenever window width or
   safe-area insets change (rotation, split-screen,
   foldables, tablets, etc).
----------------------------------------- */

function createStyles(width, insets, isTablet) {
  const { moderateScale } = makeScaler(width);

  // Cap how wide the readable content gets on tablets/large screens,
  // and center it instead of letting cards stretch edge-to-edge.
  const CONTENT_MAX_WIDTH = 900;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  const horizontalPadding = isTablet
    ? Math.max(16, (width - contentWidth) / 2 + 16)
    : 16;

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
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },

    loadingText: {
      marginTop: 12,
      color: "#68756F",
      fontSize: moderateScale(15),
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
      fontSize: moderateScale(10),
      fontWeight: "800",
      letterSpacing: 1.2,
      color: "#F5A623",
    },

    title: {
      marginTop: 3,
      fontSize: moderateScale(22),
      fontWeight: "bold",
      color: "#FFFFFF",
    },

    subtitle: {
      marginTop: 3,
      fontSize: moderateScale(12),
      color: "#D5DCE5",
    },

    searchOuter: {
      width: "100%",
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: "center",
    },

    searchContainer: {
      margin: 16,
      backgroundColor: "#FFFFFF",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#E0E8E4",
      minHeight: 50,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
    },

    searchInput: {
      flex: 1,
      marginLeft: 9,
      fontSize: moderateScale(14),
      color: "#26332E",
    },

    errorBox: {
      marginHorizontal: horizontalPadding,
      marginBottom: 12,
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: "center",
      width: "100%",
      backgroundColor: "#FFF1F1",
      borderWidth: 1,
      borderColor: "#FFD4D4",
      borderRadius: 12,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
    },

    errorText: {
      flex: 1,
      marginLeft: 9,
      color: "#B3261E",
      fontSize: moderateScale(13),
    },

    list: {
      paddingHorizontal: horizontalPadding,
      paddingBottom: insets.bottom + 30,
      maxWidth: CONTENT_MAX_WIDTH,
      width: "100%",
      alignSelf: "center",
    },

    columnWrapper: {
      gap: 13,
    },

    emptyList: {
      flexGrow: 1,
      justifyContent: "center",
    },

    emptyContainer: {
      alignItems: "center",
      paddingHorizontal: 30,
    },

    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "#FFF4EC",
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      marginTop: 15,
      fontSize: moderateScale(18),
      fontWeight: "800",
      color: "#26332E",
    },

    emptyText: {
      marginTop: 7,
      fontSize: moderateScale(13),
      lineHeight: moderateScale(19),
      color: "#7B8782",
      textAlign: "center",
    },

    card: {
      backgroundColor: "#FFFFFF",
      borderRadius: 17,
      padding: 16,
      marginBottom: 13,
      borderWidth: 1,
      borderColor: "#E1E9E5",
    },

    cardHalf: {
      flex: 1,
      maxWidth: "49%",
    },

    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },

    ticketRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      flexShrink: 1,
    },

    ticketNumber: {
      marginLeft: 7,
      fontSize: moderateScale(13),
      fontWeight: "800",
      color: "#D86A16",
      flexShrink: 1,
    },

    completedBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#E8F7EF",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },

    completedText: {
      marginLeft: 4,
      fontSize: moderateScale(10),
      fontWeight: "800",
      color: "#087A4A",
    },

    customer: {
      marginTop: 13,
      fontSize: moderateScale(19),
      fontWeight: "800",
      color: "#0F2D52",
    },

    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 13,
    },

    detailContent: {
      flex: 1,
      marginLeft: 10,
    },

    detailLabel: {
      fontSize: moderateScale(11),
      color: "#8A9691",
      fontWeight: "600",
    },

    detailValue: {
      marginTop: 2,
      fontSize: moderateScale(14),
      color: "#35423D",
      fontWeight: "600",
    },

    completedBox: {
      marginTop: 15,
      padding: 12,
      borderRadius: 12,
      backgroundColor: "#FFF4EC",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },

    completedBoxStacked: {
      flexDirection: "column",
    },

    completedItem: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    completedTextWrap: {
      marginLeft: 8,
      flexShrink: 1,
    },

    completedLabel: {
      fontSize: moderateScale(10),
      color: "#6F7D77",
    },

    completedValue: {
      marginTop: 2,
      fontSize: moderateScale(12),
      fontWeight: "700",
      color: "#263B33",
    },

    addressRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 14,
    },

    addressText: {
      flex: 1,
      marginLeft: 9,
      fontSize: moderateScale(13),
      lineHeight: moderateScale(19),
      color: "#68756F",
    },

    viewDetails: {
      marginTop: 15,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: "#EDF1EF",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    },

    viewDetailsText: {
      marginRight: 5,
      fontSize: moderateScale(13),
      fontWeight: "800",
      color: "#D86A16",
    },
  });
}