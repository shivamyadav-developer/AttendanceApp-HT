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
import deliveryService from "../../services/delivery.service";

// =============================================================
// RESPONSIVE SCALING HELPERS
// =============================================================
const GUIDELINE_BASE_WIDTH = 375; // iPhone-ish reference width

const scale = (size, width) => (width / GUIDELINE_BASE_WIDTH) * size;

const moderateScale = (size, width, factor = 0.5) =>
    size + (scale(size, width) - size) * factor;

export default function Dashboard() {
    const { width, height } = useWindowDimensions();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [tickets, setTickets] = useState([]);
    const [agentName, setAgentName] = useState("Delivery Agent");

    // =========================================================
    // LOAD DELIVERY DATA
    // =========================================================
    const loadDashboard = async (isRefresh = false) => {
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

            const user =
                await deliveryService.getCurrentUser();

            setAgentName(
                user?.name ||
                user?.site ||
                "Delivery Agent"
            );

        } catch (err) {
            console.error(
                "[Dashboard] Load error:",
                err
            );

            setError(
                err?.message ||
                "Failed to load delivery dashboard."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Reload whenever Dashboard tab gets focus
    useFocusEffect(
        useCallback(() => {
            loadDashboard();

            return undefined;
        }, [])
    );

    // =========================================================
    // WEBSITE DASHBOARD STATUS LOGIC
    // =========================================================

    const openStatuses = [
        "OPEN",
        "ASSIGNED_TO_DELIVERY",
        "VISIT_SCHEDULED",
        "IN_PROGRESS",
        "CUSTOMER_NOT_AVAILABLE",
        "DELIVERY_SCHEDULED",
    ];

    const openTickets = tickets.filter(
        (ticket) =>
            openStatuses.includes(ticket?.status)
    ).length;

    const inProgressDelivery = tickets.filter(
        (ticket) =>
            ticket?.isDelivery === true &&
            ticket?.isDeliveryDone !== true
    ).length;

    const deliveryDone = tickets.filter(
        (ticket) =>
            ticket?.isDeliveryDone === true
    ).length;

    const totalAssigned = tickets.length;

    // =========================================================
    // DELIVERY TAT - WITHIN 48 HOURS
    // =========================================================
    const deliveredTickets = tickets.filter(
        (ticket) =>
            ticket?.isDeliveryDone === true
    );

    const within48Hours = deliveredTickets.filter(
        (ticket) => {
            if (!ticket?.createdAt || !ticket?.updatedAt) {
                return false;
            }

            const created =
                new Date(ticket.createdAt);

            const completed =
                new Date(ticket.updatedAt);

            const differenceHours =
                (
                    completed.getTime() -
                    created.getTime()
                ) /
                (1000 * 60 * 60);

            return differenceHours <= 48;
        }
    ).length;

    const tatPercentage =
        deliveredTickets.length === 0
            ? 0
            : Math.round(
                (
                    within48Hours /
                    deliveredTickets.length
                ) * 100
            );

    // =========================================================
    // RECENT 5 DELIVERY TASKS
    // =========================================================
    const recentTickets = [...tickets]
        .sort((a, b) => {
            const dateA =
                new Date(a?.createdAt || 0).getTime();

            const dateB =
                new Date(b?.createdAt || 0).getTime();

            return dateB - dateA;
        })
        .slice(0, 5);

    // =========================================================
    // HELPERS
    // =========================================================
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
            }
        );
    };

    const formatAddress = (ticket) => {
        const address =
            ticket?.serviceAddress;

        if (!address) {
            return (
                ticket?.site ||
                "No address"
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

            default:
                return "#64748B";
        }
    };

    const openDelivery = (ticket) => {
        if (!ticket?._id) {
            return;
        }

        router.push({
            pathname: "/(delivery)/delivery-detail",
            params: {
                id: ticket._id,
            },
        });
    };

    // =========================================================
    // RESPONSIVE STYLES (recomputed on width/height/orientation change)
    // =========================================================
    const isTablet = width >= 768;
    const numColumns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
    const statCardWidthPct = `${Math.floor(100 / numColumns) - 2}%`;

    const styles = useMemo(
        () => createStyles(width, height, { isTablet, numColumns, statCardWidthPct }),
        [width, height, isTablet, numColumns, statCardWidthPct]
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
                    Loading delivery dashboard...
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
                    Unable to load dashboard
                </Text>

                <Text style={styles.errorMessage}>
                    {error}
                </Text>

                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() =>
                        loadDashboard()
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

    // =========================================================
    // DASHBOARD
    // =========================================================
    return (
        <View style={styles.container}>
            {/* Header stays fixed while the page scrolls */}
            <View style={styles.header}>
                <View style={styles.menuBox}>
                    <AppDrawer section="delivery" role="Delivery Agent" iconColor="#fff" />
                </View>

                <View style={styles.headerText}>
                    <Text style={styles.smallHeading}>
                        DELIVERY PERFORMANCE
                    </Text>

                    <Text style={styles.greeting}>
                        Hello, {agentName}
                    </Text>

                    <View style={styles.subtitleRow}>
                        <MaterialIcons
                            name="location-on"
                            size={moderateScale(16, width)}
                            color="#D5DCE5"
                        />

                        <Text style={styles.subtitle}>
                            Your delivery tasks
                        </Text>
                    </View>
                </View>

                <View style={styles.dateCard}>
                    <MaterialIcons
                        name="calendar-today"
                        size={moderateScale(16, width)}
                        color="#fff"
                    />

                    <Text style={styles.dateText}>
                        {new Date().toLocaleDateString(
                            "en-IN",
                            {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                            }
                        )}
                    </Text>
                </View>
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
                            loadDashboard(true)
                        }
                        colors={["#D86A16"]}
                        tintColor="#D86A16"
                    />
                }
            >

                {/* ================================================= */}
                {/* STAT CARDS */}
                {/* ================================================= */}
                <View style={styles.statsGrid}>

                    {/* Open */}
                    <StatCard
                        styles={styles}
                        width={width}
                        icon="error-outline"
                        iconColor="#EA580C"
                        iconBackground="#FFF7ED"
                        title="Open Tickets"
                        value={openTickets}
                        description="Need action"
                    />

                    {/* In Progress */}
                    <StatCard
                        styles={styles}
                        width={width}
                        icon="local-shipping"
                        iconColor="#1565C0"
                        iconBackground="#EFF6FF"
                        title="In Progress"
                        value={inProgressDelivery}
                        description="Out for delivery"
                    />

                    {/* Completed */}
                    <StatCard
                        styles={styles}
                        width={width}
                        icon="check-circle-outline"
                        iconColor="#15803D"
                        iconBackground="#F0FDF4"
                        title="Completed"
                        value={deliveryDone}
                        description="Successfully delivered"
                    />

                    {/* Total */}
                    <StatCard
                        styles={styles}
                        width={width}
                        icon="navigation"
                        iconColor="#7C3AED"
                        iconBackground="#F5F3FF"
                        title="Total Assigned"
                        value={totalAssigned}
                        description="Your tasks"
                    />

                </View>

                {/* ================================================= */}
                {/* TAT CARD */}
                {/* ================================================= */}
                <View style={styles.tatCard}>
                    <View style={styles.tatHeader}>
                        <View>
                            <Text style={styles.tatTitle}>
                                DELIVERY TAT
                            </Text>

                            <Text style={styles.tatPercentage}>
                                {tatPercentage}%
                            </Text>
                        </View>

                        <View style={styles.tatIcon}>
                            <MaterialIcons
                                name="access-time"
                                size={moderateScale(25, width)}
                                color="#D86A16"
                            />
                        </View>
                    </View>

                    <Text style={styles.tatDescription}>
                        of deliveries completed within
                        {" "}48 hours
                    </Text>

                    <View style={styles.progressBackground}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${Math.min(
                                        tatPercentage,
                                        100
                                    )}%`,
                                },
                            ]}
                        />
                    </View>

                    <View style={styles.targetRow}>
                        <MaterialIcons
                            name="check-circle"
                            size={moderateScale(13, width)}
                            color="#94A3B8"
                        />

                        <Text style={styles.targetText}>
                            Target: 90% within 48h
                        </Text>
                    </View>
                </View>

                {/* ================================================= */}
                {/* RECENT DELIVERY TASKS */}
                {/* ================================================= */}
                <View style={styles.recentSection}>

                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>
                                Recent Delivery Tasks
                            </Text>

                            <Text style={styles.sectionSubtitle}>
                                Latest tasks assigned to you
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={() =>
                                router.push(
                                    "/(delivery)/deliveries"
                                )
                            }
                        >
                            <Text style={styles.viewAll}>
                                View All →
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {recentTickets.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <MaterialIcons
                                name="local-shipping"
                                size={moderateScale(42, width)}
                                color="#CBD5E1"
                            />

                            <Text style={styles.emptyTitle}>
                                No delivery tasks
                            </Text>

                            <Text style={styles.emptyText}>
                                You currently have no
                                delivery tasks assigned.
                            </Text>
                        </View>
                    ) : (
                        recentTickets.map(
                            (ticket) => (
                                <TouchableOpacity
                                    key={ticket._id}
                                    style={styles.deliveryCard}
                                    onPress={() =>
                                        openDelivery(
                                            ticket
                                        )
                                    }
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.deliveryTopRow}>

                                        <View style={styles.ticketContainer}>
                                            <Text style={styles.ticketLabel}>
                                                TICKET
                                            </Text>

                                            <Text
                                                style={
                                                    styles.ticketNumber
                                                }
                                            >
                                                #
                                                {
                                                    ticket.ticketNumber ||
                                                    "--"
                                                }
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

                                    <View style={styles.customerRow}>
                                        <MaterialIcons
                                            name="person-outline"
                                            size={moderateScale(19, width)}
                                            color="#64748B"
                                        />

                                        <View style={styles.customerInfo}>
                                            <Text style={styles.customerLabel}>
                                                CUSTOMER
                                            </Text>

                                            <Text
                                                style={
                                                    styles.customerName
                                                }
                                                numberOfLines={1}
                                            >
                                                {
                                                    ticket.customerName ||
                                                    ticket.customer ||
                                                    ticket.customerMobile ||
                                                    "Customer"
                                                }
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.addressRow}>
                                        <MaterialIcons
                                            name="location-on"
                                            size={moderateScale(19, width)}
                                            color="#64748B"
                                        />

                                        <Text
                                            style={
                                                styles.addressText
                                            }
                                            numberOfLines={2}
                                        >
                                            {formatAddress(
                                                ticket
                                            )}
                                        </Text>
                                    </View>

                                    <View style={styles.cardBottomRow}>
                                        <View style={styles.dateRow}>
                                            <MaterialIcons
                                                name="schedule"
                                                size={moderateScale(16, width)}
                                                color="#94A3B8"
                                            />

                                            <Text
                                                style={
                                                    styles.createdText
                                                }
                                            >
                                                Created{" "}
                                                {formatDate(
                                                    ticket.createdAt
                                                )}
                                            </Text>
                                        </View>

                                        <MaterialIcons
                                            name="chevron-right"
                                            size={moderateScale(24, width)}
                                            color="#94A3B8"
                                        />
                                    </View>
                                </TouchableOpacity>
                            )
                        )
                    )}
                </View>

                {/* Bottom spacing */}
                <View style={{ height: moderateScale(30, width) }} />

            </ScrollView>
        </View>
    );
}

// =============================================================
// STAT CARD COMPONENT
// =============================================================
function StatCard({
    styles,
    width,
    icon,
    iconColor,
    iconBackground,
    title,
    value,
    description,
}) {
    return (
        <View style={styles.statCard}>
            <View style={styles.statTopRow}>

                <View style={styles.statTextContainer}>
                    <Text style={styles.statTitle}>
                        {title}
                    </Text>

                    <Text style={styles.statValue}>
                        {value}
                    </Text>

                    <Text style={styles.statDescription}>
                        {description}
                    </Text>
                </View>

                <View
                    style={[
                        styles.statIcon,
                        {
                            backgroundColor:
                                iconBackground,
                        },
                    ]}
                >
                    <MaterialIcons
                        name={icon}
                        size={moderateScale(22, width)}
                        color={iconColor}
                    />
                </View>

            </View>
        </View>
    );
}

// =============================================================
// STYLES (generated per-dimension so it reflows on rotation/resize)
// =============================================================
function createStyles(width, height, { isTablet, statCardWidthPct }) {
    const ms = (size, factor) => moderateScale(size, width, factor);

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
            lineHeight: ms(20),
            marginBottom: ms(20),
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

        // ---------------------------------------------------------
        // HEADER
        // ---------------------------------------------------------

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
            gap: ms(12),
        },

        menuBox: {
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
        },

        headerText: {
            flex: 1,
        },

        smallHeading: {
            fontSize: ms(10),
            fontWeight: "800",
            color: "#F5A623",
            letterSpacing: 1.2,
            marginBottom: ms(3),
        },

        greeting: {
            fontSize: ms(20, 0.4),
            fontWeight: "bold",
            color: "#FFFFFF",
        },

        subtitleRow: {
            flexDirection: "row",
            alignItems: "center",
            marginTop: ms(4),
            gap: ms(4),
        },

        subtitle: {
            fontSize: ms(12),
            color: "#D5DCE5",
        },

        dateCard: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.15)",
            borderRadius: ms(10),
            paddingHorizontal: ms(10),
            paddingVertical: ms(8),
            gap: ms(6),
        },

        dateText: {
            fontSize: ms(11),
            fontWeight: "700",
            color: "#FFFFFF",
        },

        // ---------------------------------------------------------
        // STAT CARDS
        // ---------------------------------------------------------

        statsGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            paddingHorizontal: ms(14),
            marginTop: ms(14),
            gap: ms(10),
        },

        statCard: {
            width: statCardWidthPct,
            backgroundColor: "#FFFFFF",
            borderRadius: ms(13),
            padding: ms(14),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            minHeight: ms(112),
        },

        statTopRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
        },

        statTextContainer: {
            flex: 1,
            paddingRight: ms(5),
        },

        statTitle: {
            fontSize: ms(11),
            fontWeight: "700",
            color: "#64748B",
        },

        statValue: {
            fontSize: ms(28, 0.4),
            fontWeight: "900",
            color: "#0F172A",
            marginTop: ms(4),
        },

        statDescription: {
            fontSize: ms(9),
            color: "#94A3B8",
            marginTop: ms(2),
        },

        statIcon: {
            width: ms(38),
            height: ms(38),
            borderRadius: ms(10),
            alignItems: "center",
            justifyContent: "center",
        },

        // ---------------------------------------------------------
        // TAT
        // ---------------------------------------------------------

        tatCard: {
            marginHorizontal: ms(14),
            marginTop: ms(14),
            backgroundColor: "#0F2D52",
            borderRadius: ms(14),
            padding: ms(18),
        },

        tatHeader: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
        },

        tatTitle: {
            fontSize: ms(11),
            fontWeight: "800",
            color: "#CBD5E1",
            letterSpacing: 1.4,
        },

        tatPercentage: {
            fontSize: ms(36, 0.4),
            fontWeight: "900",
            color: "#FFFFFF",
            marginTop: ms(5),
        },

        tatIcon: {
            width: ms(44),
            height: ms(44),
            borderRadius: ms(12),
            backgroundColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
        },

        tatDescription: {
            fontSize: ms(12),
            color: "#CBD5E1",
            marginTop: ms(2),
        },

        progressBackground: {
            height: ms(7),
            backgroundColor: "rgba(255,255,255,0.18)",
            borderRadius: ms(10),
            overflow: "hidden",
            marginTop: ms(16),
        },

        progressFill: {
            height: "100%",
            backgroundColor: "#D86A16",
            borderRadius: ms(10),
        },

        targetRow: {
            flexDirection: "row",
            alignItems: "center",
            marginTop: ms(11),
            gap: ms(5),
        },

        targetText: {
            fontSize: ms(10),
            color: "#94A3B8",
        },

        // ---------------------------------------------------------
        // RECENT TASKS
        // ---------------------------------------------------------

        recentSection: {
            marginTop: ms(20),
            paddingHorizontal: ms(14),
        },

        sectionHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: ms(11),
        },

        sectionTitle: {
            fontSize: ms(17),
            fontWeight: "900",
            color: "#0F172A",
        },

        sectionSubtitle: {
            fontSize: ms(11),
            color: "#94A3B8",
            marginTop: ms(3),
        },

        viewAll: {
            fontSize: ms(10),
            fontWeight: "800",
            color: "#D86A16",
        },

        emptyCard: {
            backgroundColor: "#FFFFFF",
            borderRadius: ms(13),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: ms(30),
            alignItems: "center",
        },

        emptyTitle: {
            fontSize: ms(15),
            fontWeight: "800",
            color: "#334155",
            marginTop: ms(10),
        },

        emptyText: {
            fontSize: ms(12),
            color: "#94A3B8",
            textAlign: "center",
            marginTop: ms(5),
            lineHeight: ms(18),
        },

        // ---------------------------------------------------------
        // DELIVERY CARD
        // ---------------------------------------------------------

        deliveryCard: {
            backgroundColor: "#FFFFFF",
            borderRadius: ms(13),
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: ms(15),
            marginBottom: ms(10),
        },

        deliveryTopRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
        },

        ticketContainer: {
            flex: 1,
        },

        ticketLabel: {
            fontSize: ms(8),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 1,
        },

        ticketNumber: {
            fontSize: ms(13),
            fontWeight: "900",
            color: "#0F172A",
            marginTop: ms(3),
        },

        statusBadge: {
            borderRadius: ms(7),
            paddingHorizontal: ms(8),
            paddingVertical: ms(5),
            marginLeft: ms(8),
        },

        statusText: {
            fontSize: ms(9),
            fontWeight: "800",
        },

        customerRow: {
            flexDirection: "row",
            alignItems: "center",
            marginTop: ms(15),
            gap: ms(9),
        },

        customerInfo: {
            flex: 1,
        },

        customerLabel: {
            fontSize: ms(8),
            fontWeight: "800",
            color: "#94A3B8",
            letterSpacing: 0.8,
        },

        customerName: {
            fontSize: ms(13),
            fontWeight: "700",
            color: "#334155",
            marginTop: ms(2),
        },

        addressRow: {
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: ms(10),
            gap: ms(9),
        },

        addressText: {
            flex: 1,
            fontSize: ms(11),
            color: "#64748B",
            lineHeight: ms(17),
        },

        cardBottomRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: "#F1F5F9",
            marginTop: ms(12),
            paddingTop: ms(10),
        },

        dateRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: ms(5),
        },

        createdText: {
            fontSize: ms(10),
            color: "#94A3B8",
        },
    });
}