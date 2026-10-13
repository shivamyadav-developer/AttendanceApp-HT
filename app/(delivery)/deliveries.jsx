import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

import deliveryService from "../../services/delivery.service";

// =============================================================
// RESPONSIVE SCALING HELPERS
// =============================================================
const GUIDELINE_BASE_WIDTH = 375; // iPhone-ish reference width

const scale = (size, width) => (width / GUIDELINE_BASE_WIDTH) * size;

const moderateScale = (size, width, factor = 0.5) =>
    size + (scale(size, width) - size) * factor;

export default function Deliveries() {
    const { width, height } = useWindowDimensions();

    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedFilter, setSelectedFilter] = useState("ALL");

    // =========================================================
    // LOAD DELIVERY TASKS
    // =========================================================
    const loadDeliveries = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError("");

            const result =
                await deliveryService.getMyDeliveries();

            setTickets(result?.tickets || []);
        } catch (err) {
            console.error(
                "[Deliveries] Load error:",
                err
            );

            setError(
                err?.message ||
                "Failed to load delivery tasks."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Reload whenever Deliveries tab gets focus
    useFocusEffect(
        useCallback(() => {
            loadDeliveries();

            return undefined;
        }, [])
    );

    // =========================================================
    // HELPERS
    // =========================================================
    const getStatusLabel = (status) => {
        if (!status) {
            return "Unknown";
        }

        return status
            .replace(/_/g, " ")
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "DELIVERY_DONE":
                return "#15803D";

            case "OUT_FOR_DELIVERY":
            case "IN_PROGRESS":
            case "ASSIGNED_TO_DELIVERY":
                return "#1565C0";

            case "CANCELLED":
                return "#DC2626";

            case "CUSTOMER_NOT_AVAILABLE":
                return "#D97706";

            case "DELIVERY_SCHEDULED":
                return "#7C3AED";

            default:
                return "#64748B";
        }
    };

    const formatAddress = (ticket) => {
        const address =
            ticket?.serviceAddress;

        if (!address) {
            return (
                ticket?.site ||
                "No address available"
            );
        }

        if (typeof address === "string") {
            return address;
        }

        return [
            address?.line1,
            address?.line2,
            address?.city,
            address?.state,
            address?.pincode,
        ]
            .filter(Boolean)
            .join(", ");
    };

    const formatDate = (dateString) => {
        if (!dateString) {
            return "--";
        }

        const date =
            new Date(dateString);

        if (Number.isNaN(date.getTime())) {
            return "--";
        }

        return date.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );
    };

    // =========================================================
    // FILTER BUTTONS
    // =========================================================
    const filters = [
        {
            key: "ALL",
            label: "All",
        },
        {
            key: "OPEN",
            label: "Open",
        },
        {
            key: "IN_PROGRESS",
            label: "In Progress",
        },
        {
            key: "COMPLETED",
            label: "Completed",
        },
        {
            key: "FAILED",
            label: "Failed",
        },
    ];

    const matchesFilter = (ticket) => {
        if (selectedFilter === "ALL") {
            return true;
        }

        if (selectedFilter === "OPEN") {
            return [
                "OPEN",
                "ASSIGNED_TO_DELIVERY",
                "VISIT_SCHEDULED",
                "DELIVERY_SCHEDULED",
            ].includes(ticket?.status);
        }

        if (selectedFilter === "IN_PROGRESS") {
            return (
                ticket?.isDelivery === true &&
                ticket?.isDeliveryDone !== true &&
                ticket?.status !== "CANCELLED"
            );
        }

        if (selectedFilter === "COMPLETED") {
            return (
                ticket?.isDeliveryDone === true ||
                ticket?.status === "DELIVERY_DONE"
            );
        }

        if (selectedFilter === "FAILED") {
            return (
                ticket?.status === "CANCELLED"
            );
        }

        return true;
    };

    const matchesSearch = (ticket) => {
        const query =
            search.trim().toLowerCase();

        if (!query) {
            return true;
        }

        const ticketNumber =
            String(
                ticket?.ticketNumber || ""
            ).toLowerCase();

        const customerName =
            String(
                ticket?.customerName || ""
            ).toLowerCase();

        const customerMobile =
            String(
                ticket?.customerMobile || ""
            ).toLowerCase();

        const address =
            formatAddress(ticket).toLowerCase();

        return (
            ticketNumber.includes(query) ||
            customerName.includes(query) ||
            customerMobile.includes(query) ||
            address.includes(query)
        );
    };

    const filteredTickets = tickets.filter(
        (ticket) =>
            matchesFilter(ticket) &&
            matchesSearch(ticket)
    );

    // =========================================================
    // COUNTS
    // =========================================================
    const openCount = tickets.filter(
        (ticket) =>
            [
                "OPEN",
                "ASSIGNED_TO_DELIVERY",
                "VISIT_SCHEDULED",
                "DELIVERY_SCHEDULED",
            ].includes(ticket?.status)
    ).length;

    const inProgressCount = tickets.filter(
        (ticket) =>
            ticket?.isDelivery === true &&
            ticket?.isDeliveryDone !== true &&
            ticket?.status !== "CANCELLED"
    ).length;

    const completedCount = tickets.filter(
        (ticket) =>
            ticket?.isDeliveryDone === true ||
            ticket?.status === "DELIVERY_DONE"
    ).length;

    const failedCount = tickets.filter(
        (ticket) =>
            ticket?.status === "CANCELLED"
    ).length;

    // =========================================================
    // OPEN DELIVERY DETAIL
    // =========================================================
    const openDelivery = (ticket) => {
        if (!ticket?._id) {
            return;
        }

        router.push({
            pathname:
                "/(delivery)/delivery-detail",
            params: {
                id: ticket._id,
            },
        });
    };

    // =========================================================
    // RESPONSIVE STYLES
    // =========================================================
    const isTablet = width >= 768;

    const styles = useMemo(
        () => createStyles(width, height, { isTablet }),
        [width, height, isTablet]
    );

    // =========================================================
    // LOADING
    // =========================================================
    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator
                    size="large"
                    color="#D86A16"
                />

                <Text style={styles.loadingText}>
                    Loading delivery tasks...
                </Text>
            </View>
        );
    }

    // =========================================================
    // ERROR
    // =========================================================
    if (error) {
        return (
            <View style={styles.centerContainer}>
                <View style={styles.errorIcon}>
                    <MaterialIcons
                        name="error-outline"
                        size={moderateScale(42, width)}
                        color="#DC2626"
                    />
                </View>

                <Text style={styles.errorTitle}>
                    Unable to load deliveries
                </Text>

                <Text style={styles.errorMessage}>
                    {error}
                </Text>

                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() =>
                        loadDeliveries()
                    }
                >
                    <MaterialIcons
                        name="refresh"
                        size={moderateScale(20, width)}
                        color="#FFFFFF"
                    />

                    <Text style={styles.retryText}>
                        Retry
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>

            {/* ================================================= */}
            {/* HEADER */}
            {/* ================================================= */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>
                        My Deliveries
                    </Text>

                    <Text style={styles.headerSubtitle}>
                        {tickets.length} task
                        {tickets.length === 1
                            ? ""
                            : "s"} assigned to you
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={() =>
                        loadDeliveries(true)
                    }
                >
                    <MaterialIcons
                        name="refresh"
                        size={moderateScale(22, width)}
                        color="#fff"
                    />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                    isTablet ? styles.scrollContentTablet : undefined
                }
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() =>
                            loadDeliveries(true)
                        }
                        colors={["#D86A16"]}
                        tintColor="#D86A16"
                    />
                }
            >

                {/* ================================================= */}
                {/* SUMMARY */}
                {/* ================================================= */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={
                        styles.summaryContainer
                    }
                >
                    <SummaryCard
                        styles={styles}
                        width={width}
                        title="Total"
                        value={tickets.length}
                        icon="local-shipping"
                        color="#7C3AED"
                        background="#F5F3FF"
                    />

                    <SummaryCard
                        styles={styles}
                        width={width}
                        title="Open"
                        value={openCount}
                        icon="error-outline"
                        color="#EA580C"
                        background="#FFF7ED"
                    />

                    <SummaryCard
                        styles={styles}
                        width={width}
                        title="In Progress"
                        value={inProgressCount}
                        icon="directions-car"
                        color="#1565C0"
                        background="#EFF6FF"
                    />

                    <SummaryCard
                        styles={styles}
                        width={width}
                        title="Completed"
                        value={completedCount}
                        icon="check-circle-outline"
                        color="#15803D"
                        background="#F0FDF4"
                    />

                    <SummaryCard
                        styles={styles}
                        width={width}
                        title="Failed"
                        value={failedCount}
                        icon="cancel"
                        color="#DC2626"
                        background="#FEF2F2"
                    />
                </ScrollView>

                {/* ================================================= */}
                {/* SEARCH */}
                {/* ================================================= */}
                <View style={styles.searchContainer}>
                    <MaterialIcons
                        name="search"
                        size={moderateScale(22, width)}
                        color="#94A3B8"
                    />

                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search ticket, customer or address"
                        placeholderTextColor="#94A3B8"
                        returnKeyType="search"
                    />

                    {search.length > 0 && (
                        <TouchableOpacity
                            onPress={() =>
                                setSearch("")
                            }
                        >
                            <MaterialIcons
                                name="close"
                                size={moderateScale(20, width)}
                                color="#64748B"
                            />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ================================================= */}
                {/* FILTERS */}
                {/* ================================================= */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={
                        styles.filterContainer
                    }
                >
                    {filters.map((filter) => {
                        const active =
                            selectedFilter ===
                            filter.key;

                        return (
                            <TouchableOpacity
                                key={filter.key}
                                style={[
                                    styles.filterButton,
                                    active &&
                                    styles.filterButtonActive,
                                ]}
                                onPress={() =>
                                    setSelectedFilter(
                                        filter.key
                                    )
                                }
                            >
                                <Text
                                    style={[
                                        styles.filterText,
                                        active &&
                                        styles.filterTextActive,
                                    ]}
                                >
                                    {filter.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* ================================================= */}
                {/* RESULT COUNT */}
                {/* ================================================= */}
                <View style={styles.resultHeader}>
                    <Text style={styles.resultTitle}>
                        Delivery Tasks
                    </Text>

                    <Text style={styles.resultCount}>
                        {filteredTickets.length} found
                    </Text>
                </View>

                {/* ================================================= */}
                {/* NO RESULTS */}
                {/* ================================================= */}
                {filteredTickets.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                            <MaterialIcons
                                name="local-shipping"
                                size={moderateScale(38, width)}
                                color="#CBD5E1"
                            />
                        </View>

                        <Text style={styles.emptyTitle}>
                            No delivery tasks found
                        </Text>

                        <Text style={styles.emptyText}>
                            {search
                                ? "Try a different search."
                                : selectedFilter !==
                                    "ALL"
                                    ? "There are no tasks in this category."
                                    : "You currently have no delivery tasks assigned."}
                        </Text>
                    </View>
                ) : (
                    filteredTickets.map(
                        (ticket) => (
                            <TouchableOpacity
                                key={ticket._id}
                                style={styles.deliveryCard}
                                activeOpacity={0.75}
                                onPress={() =>
                                    openDelivery(
                                        ticket
                                    )
                                }
                            >

                                {/* Top */}
                                <View
                                    style={
                                        styles.cardTopRow
                                    }
                                >
                                    <View
                                        style={
                                            styles.ticketInfo
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.ticketLabel
                                            }
                                        >
                                            TICKET
                                        </Text>

                                        <Text
                                            style={
                                                styles.ticketNumber
                                            }
                                        >
                                            #
                                            {ticket.ticketNumber ||
                                                "--"}
                                        </Text>
                                    </View>

                                    <View
                                        style={[
                                            styles.statusBadge,
                                            {
                                                backgroundColor:
                                                    `${getStatusColor(
                                                        ticket.status
                                                    )}18`,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.statusText,
                                                {
                                                    color:
                                                        getStatusColor(
                                                            ticket.status
                                                        ),
                                                },
                                            ]}
                                        >
                                            {getStatusLabel(
                                                ticket.status
                                            )}
                                        </Text>
                                    </View>
                                </View>

                                {/* Customer */}
                                <View
                                    style={
                                        styles.infoRow
                                    }
                                >
                                    <View
                                        style={
                                            styles.infoIcon
                                        }
                                    >
                                        <MaterialIcons
                                            name="person-outline"
                                            size={moderateScale(19, width)}
                                            color="#64748B"
                                        />
                                    </View>

                                    <View
                                        style={
                                            styles.infoContent
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.infoLabel
                                            }
                                        >
                                            CUSTOMER
                                        </Text>

                                        <Text
                                            style={
                                                styles.infoValue
                                            }
                                            numberOfLines={1}
                                        >
                                            {ticket.customerName ||
                                                "Customer"}
                                        </Text>

                                        {ticket.customerMobile && (
                                            <Text
                                                style={
                                                    styles.mobileText
                                                }
                                            >
                                                {
                                                    ticket.customerMobile
                                                }
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* Address */}
                                <View
                                    style={
                                        styles.infoRow
                                    }
                                >
                                    <View
                                        style={
                                            styles.infoIcon
                                        }
                                    >
                                        <MaterialIcons
                                            name="location-on"
                                            size={moderateScale(19, width)}
                                            color="#64748B"
                                        />
                                    </View>

                                    <View
                                        style={
                                            styles.infoContent
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.infoLabel
                                            }
                                        >
                                            DELIVERY ADDRESS
                                        </Text>

                                        <Text
                                            style={
                                                styles.addressValue
                                            }
                                            numberOfLines={3}
                                        >
                                            {formatAddress(
                                                ticket
                                            )}
                                        </Text>
                                    </View>
                                </View>

                                {/* Type */}
                                {ticket.type && (
                                    <View
                                        style={
                                            styles.typeRow
                                        }
                                    >
                                        <MaterialIcons
                                            name="category"
                                            size={moderateScale(16, width)}
                                            color="#94A3B8"
                                        />

                                        <Text
                                            style={
                                                styles.typeText
                                            }
                                        >
                                            {ticket.type}
                                        </Text>

                                        {ticket.category && (
                                            <>
                                                <View
                                                    style={
                                                        styles.dot
                                                    }
                                                />

                                                <Text
                                                    style={
                                                        styles.typeText
                                                    }
                                                >
                                                    {
                                                        ticket.category
                                                    }
                                                </Text>
                                            </>
                                        )}
                                    </View>
                                )}

                                {/* Bottom */}
                                <View
                                    style={
                                        styles.cardBottom
                                    }
                                >
                                    <View
                                        style={
                                            styles.dateRow
                                        }
                                    >
                                        <MaterialIcons
                                            name="schedule"
                                            size={moderateScale(16, width)}
                                            color="#94A3B8"
                                        />

                                        <Text
                                            style={
                                                styles.dateText
                                            }
                                        >
                                            Created{" "}
                                            {formatDate(
                                                ticket.createdAt
                                            )}
                                        </Text>
                                    </View>

                                    <View
                                        style={
                                            styles.openDetail
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.openDetailText
                                            }
                                        >
                                            View Details
                                        </Text>

                                        <MaterialIcons
                                            name="chevron-right"
                                            size={moderateScale(20, width)}
                                            color="#D86A16"
                                        />
                                    </View>
                                </View>

                            </TouchableOpacity>
                        )
                    )
                )}

                <View style={{ height: moderateScale(30, width) }} />

            </ScrollView>
        </View>
    );
}

// =============================================================
// SUMMARY CARD
// =============================================================
function SummaryCard({
    styles,
    width,
    title,
    value,
    icon,
    color,
    background,
}) {
    return (
        <View style={styles.summaryCard}>
            <View
                style={[
                    styles.summaryIcon,
                    {
                        backgroundColor:
                            background,
                    },
                ]}
            >
                <MaterialIcons
                    name={icon}
                    size={moderateScale(20, width)}
                    color={color}
                />
            </View>

            <Text style={styles.summaryValue}>
                {value}
            </Text>

            <Text style={styles.summaryTitle}>
                {title}
            </Text>
        </View>
    );
}

// =============================================================
// STYLES (generated per-dimension so it reflows on rotation/resize)
// =============================================================
function createStyles(width, height, { isTablet }) {
    const ms = (size, factor) => moderateScale(size, width, factor);
    const summaryCardWidth = isTablet ? ms(130) : ms(105);

    return StyleSheet.create({

        container: {
            flex: 1,
            backgroundColor: "#F3EEE8",
        },

        scrollContentTablet: {
            maxWidth: 900,
            width: "100%",
            alignSelf: "center",
        },

        centerContainer: {
            flex: 1,
            backgroundColor: "#F3EEE8",
            alignItems: "center",
            justifyContent: "center",
            padding: ms(24),
        },

        loadingText: {
            marginTop: ms(12),
            fontSize: ms(14),
            color: "#64748B",
            fontWeight: "500",
        },

        errorIcon: {
            width: ms(72),
            height: ms(72),
            borderRadius: ms(36),
            backgroundColor: "#FEF2F2",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: ms(16),
        },

        errorTitle: {
            fontSize: ms(18),
            fontWeight: "800",
            color: "#1E293B",
            marginBottom: ms(8),
        },

        errorMessage: {
            fontSize: ms(13),
            color: "#64748B",
            textAlign: "center",
            textAlignVertical: "center",
            marginBottom: ms(20),
            lineHeight: ms(20),
        },

        retryButton: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#D86A16",
            paddingHorizontal: ms(22),
            paddingVertical: ms(12),
            borderRadius: ms(10),
            gap: ms(7),
        },

        retryText: {
            color: "#FFFFFF",
            fontSize: ms(14),
            fontWeight: "700",
        },

        // =========================================================
        // HEADER
        // =========================================================

        header: {
            backgroundColor: "#0F2D52",
            height: 160,
            paddingTop: 50,
            paddingHorizontal: 18,
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },

        headerTitle: {
            fontSize: ms(22, 0.4),
            fontWeight: "bold",
            color: "#FFFFFF",
        },

        headerSubtitle: {
            fontSize: ms(12),
            color: "#D5DCE5",
            marginTop: ms(3),
        },

        refreshButton: {
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
        },

        // =========================================================
        // SUMMARY
        // =========================================================

        summaryContainer: {
            paddingHorizontal: ms(14),
            paddingTop: ms(14),
            paddingBottom: ms(8),
            gap: ms(10),
        },

        summaryCard: {
            width: summaryCardWidth,
            backgroundColor: "#FFFFFF",
            borderRadius: ms(12),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: ms(12),
        },

        summaryIcon: {
            width: ms(34),
            height: ms(34),
            borderRadius: ms(9),
            alignItems: "center",
            justifyContent: "center",
        },

        summaryValue: {
            fontSize: ms(24, 0.4),
            fontWeight: "900",
            color: "#0F172A",
            marginTop: ms(7),
        },

        summaryTitle: {
            fontSize: ms(10),
            fontWeight: "700",
            color: "#64748B",
            marginTop: ms(1),
        },

        // =========================================================
        // SEARCH
        // =========================================================

        searchContainer: {
            marginHorizontal: ms(14),
            marginTop: ms(10),
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: ms(11),
            minHeight: ms(48),
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: ms(13),
            gap: ms(9),
        },

        searchInput: {
            flex: 1,
            fontSize: ms(13),
            color: "#334155",
            paddingVertical: 0,
        },

        // =========================================================
        // FILTERS
        // =========================================================

        filterContainer: {
            paddingHorizontal: ms(14),
            paddingVertical: ms(12),
            gap: ms(8),
        },

        filterButton: {
            borderWidth: 1,
            borderColor: "#E2E8F0",
            backgroundColor: "#FFFFFF",
            borderRadius: ms(20),
            paddingHorizontal: ms(15),
            paddingVertical: ms(8),
        },

        filterButtonActive: {
            backgroundColor: "#0F2D52",
            borderColor: "#0F2D52",
        },

        filterText: {
            fontSize: ms(11),
            fontWeight: "700",
            color: "#64748B",
        },

        filterTextActive: {
            color: "#FFFFFF",
        },

        // =========================================================
        // RESULTS
        // =========================================================

        resultHeader: {
            paddingHorizontal: ms(15),
            paddingTop: ms(3),
            paddingBottom: ms(10),
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },

        resultTitle: {
            fontSize: ms(17),
            fontWeight: "900",
            color: "#0F172A",
        },

        resultCount: {
            fontSize: ms(11),
            fontWeight: "700",
            color: "#94A3B8",
        },

        // =========================================================
        // EMPTY
        // =========================================================

        emptyCard: {
            marginHorizontal: ms(14),
            backgroundColor: "#FFFFFF",
            borderRadius: ms(13),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: ms(32),
            alignItems: "center",
        },

        emptyIcon: {
            width: ms(70),
            height: ms(70),
            borderRadius: ms(35),
            backgroundColor: "#F8FAFC",
            alignItems: "center",
            justifyContent: "center",
        },

        emptyTitle: {
            fontSize: ms(16),
            fontWeight: "800",
            color: "#334155",
            marginTop: ms(13),
        },

        emptyText: {
            fontSize: ms(12),
            color: "#94A3B8",
            textAlign: "center",
            marginTop: ms(6),
            lineHeight: ms(18),
        },

        // =========================================================
        // DELIVERY CARD
        // =========================================================

        deliveryCard: {
            marginHorizontal: ms(14),
            marginBottom: ms(11),
            backgroundColor: "#FFFFFF",
            borderRadius: ms(13),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: ms(15),
        },

        cardTopRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
        },

        ticketInfo: {
            flex: 1,
        },

        ticketLabel: {
            fontSize: ms(8),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 1,
        },

        ticketNumber: {
            fontSize: ms(14),
            fontWeight: "900",
            color: "#0F172A",
            marginTop: ms(3),
        },

        statusBadge: {
            borderRadius: ms(7),
            paddingHorizontal: ms(9),
            paddingVertical: ms(6),
            marginLeft: ms(8),
            maxWidth: ms(150),
        },

        statusText: {
            fontSize: ms(9),
            fontWeight: "800",
            textAlign: "center",
        },

        infoRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: ms(15),
            gap: ms(10),
        },

        infoIcon: {
            width: ms(30),
            height: ms(30),
            borderRadius: ms(8),
            backgroundColor: "#F8FAFC",
            alignItems: "center",
            justifyContent: "center",
        },

        infoContent: {
            flex: 1,
        },

        infoLabel: {
            fontSize: ms(8),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 0.8,
        },

        infoValue: {
            fontSize: ms(13),
            fontWeight: "700",
            color: "#334155",
            marginTop: ms(3),
        },

        mobileText: {
            fontSize: ms(11),
            color: "#64748B",
            marginTop: ms(2),
        },

        addressValue: {
            fontSize: ms(12),
            color: "#475569",
            lineHeight: ms(18),
            marginTop: ms(3),
        },

        typeRow: {
            flexDirection: "row",
            alignItems: "center",
            marginTop: ms(13),
            gap: ms(6),
        },

        typeText: {
            fontSize: ms(10),
            color: "#64748B",
            fontWeight: "600",
        },

        dot: {
            width: ms(3),
            height: ms(3),
            borderRadius: ms(2),
            backgroundColor: "#CBD5E1",
            marginHorizontal: ms(2),
        },

        cardBottom: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderTopWidth: 1,
            borderTopColor: "#F1F5F9",
            marginTop: ms(14),
            paddingTop: ms(11),
        },

        dateRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: ms(5),
        },

        dateText: {
            fontSize: ms(10),
            color: "#94A3B8",
        },

        openDetail: {
            flexDirection: "row",
            alignItems: "center",
            gap: ms(2),
        },

        openDetailText: {
            fontSize: ms(10),
            fontWeight: "800",
            color: "#D86A16",
        },
    });
}