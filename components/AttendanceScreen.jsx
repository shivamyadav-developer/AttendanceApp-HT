import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import attendanceService from "../services/attendance.service";
import eventEmitter from "../services/eventEmitter";
import locationService from "../services/location.service";
import { MAX_DISTANCE, MOCK_LOCATION_MESSAGE } from "../utils/location";

// ─── helpers ────────────────────────────────────────────────────────────────

// Today's own check-in / check-out times, saved on the phone.
// Needed because the backend files a session under the day it STARTED —
// e.g. a check-out today that closes yesterday's session has no "today" record.
const PUNCH_KEY = "todayPunchTimes";
const localDateKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

const loadTodayPunch = async (employeeNumber) => {
  try {
    const raw = await AsyncStorage.getItem(PUNCH_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.date === localDateKey() && saved?.employeeNumber === employeeNumber) {
      return { checkIn: saved.checkIn || null, checkOut: saved.checkOut || null };
    }
  } catch { }
  return { checkIn: null, checkOut: null };
};

const saveTodayPunch = async (employeeNumber, punch) => {
  try {
    await AsyncStorage.setItem(
      PUNCH_KEY,
      JSON.stringify({ ...punch, employeeNumber, date: localDateKey() })
    );
  } catch { }
};

const formatTime = (dateString) => {
  if (!dateString) return "--:--";
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const computeDurationValue = (isCheckedIn, checkInISO, closedMinutes = 0) => {
  if (!isCheckedIn) {
    const mins = closedMinutes || 0;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  if (!checkInISO) return "0h 0m 0s";

  const elapsedSec = Math.floor(
    (Date.now() - new Date(checkInISO).getTime()) / 1000
  );
  const totalSec = closedMinutes * 60 + elapsedSec;

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${m}m ${s}s`;
};

// ─── isolated ticking component ────────────────────────────────────────────
// Owns its own interval + state. Only THIS re-renders every second —
// parent and siblings (stats row, history list) never do.

const LiveDurationText = memo(function LiveDurationText({
  isCheckedIn,
  checkInISO,
  closedMinutes,
}) {
  const [duration, setDuration] = useState(() =>
    computeDurationValue(isCheckedIn, checkInISO, closedMinutes)
  );

  useEffect(() => {
    if (!isCheckedIn || !checkInISO) {
      setDuration(computeDurationValue(false, null, closedMinutes));
      return;
    }

    setDuration(computeDurationValue(true, checkInISO, closedMinutes));
    const id = setInterval(() => {
      setDuration(computeDurationValue(true, checkInISO, closedMinutes));
    }, 1000);

    return () => clearInterval(id);
  }, [isCheckedIn, checkInISO, closedMinutes]);

  return <Text style={styles.durationValue}>{duration}</Text>;
});

// ─── memoized sections ──────────────────────────────────────────────────────

const StatsRow = memo(function StatsRow({
  statusColor,
  statusLabel,
  distance,
  isInsideOffice,
}) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <MaterialIcons name="access-time" size={24} color="#D96A17" />
        <Text style={styles.statLabel}>Status</Text>
        <Text style={[styles.statValue, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>
      <View style={styles.statCard}>
        <MaterialIcons name="calendar-today" size={24} color="#D96A17" />
        <Text style={styles.statLabel}>Today</Text>
        <Text style={styles.statValue}>
          {new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })}
        </Text>
      </View>
      <View style={styles.statCard}>
        <MaterialIcons
          name={isInsideOffice ? "location-on" : "location-off"}
          size={24}
          color={isInsideOffice ? "#10B981" : "#D96A17"}
        />
        <Text style={styles.statLabel}>Distance</Text>
        <Text style={styles.statValue}>
          {distance == null ? "--" : `${Math.round(distance)}m`}
        </Text>
      </View>
    </View>
  );
});

const SessionCard = memo(function SessionCard({
  todayAttendance,
  isCheckedIn,
  statusColor,
  statusLabel,
  activeCheckIn,
  todayDisplayStatus,
}) {
  if (!todayAttendance) {
    return (
      <View style={styles.emptyCard}>
        <MaterialIcons name="event-busy" size={32} color="#D1D5DB" />
        <Text style={styles.emptyText}>No attendance recorded today</Text>
        <Text style={styles.emptySubText}>
          Tap Check In when you reach the store
        </Text>
      </View>
    );
  }

  const checkInISO = isCheckedIn
    ? activeCheckIn || todayAttendance.oldestCheckIn
    : null;
  const closedMinutes = todayAttendance.totalDurationMinutes || 0;

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionDate}>
          {todayAttendance.date || new Date().toISOString().split("T")[0]}
        </Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: isCheckedIn ? "#D1FAE5" : "#FEE2E2" },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusPillText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.durationBlock}>
        <MaterialIcons name="timer" size={20} color="#D96A17" />
        <Text style={styles.durationLabel}>
          {isCheckedIn ? "Time in office" : "Total duration"}
        </Text>
        <LiveDurationText
          isCheckedIn={isCheckedIn}
          checkInISO={checkInISO}
          closedMinutes={closedMinutes}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.sessionDetail}>
        <MaterialIcons name="login" size={16} color="#6B7280" />
        <Text style={styles.sessionLabel}>Check In</Text>
        <Text style={styles.sessionValue}>
          {isCheckedIn && activeCheckIn
            ? formatTime(activeCheckIn)
            : formatTime(todayAttendance.oldestCheckIn)}
        </Text>
      </View>

      <View style={styles.sessionDetail}>
        <MaterialIcons
          name="logout"
          size={16}
          color={isCheckedIn ? "#D1D5DB" : "#6B7280"}
        />
        <Text style={styles.sessionLabel}>Check Out</Text>
        <Text
          style={[styles.sessionValue, isCheckedIn && { color: "#9CA3AF" }]}
        >
          {isCheckedIn
            ? "Active session"
            : todayAttendance.latestCheckOut
              ? formatTime(todayAttendance.latestCheckOut)
              : "—"}
        </Text>
      </View>

      <View style={styles.sessionDetail}>
        <MaterialIcons name="repeat" size={16} color="#6B7280" />
        <Text style={styles.sessionLabel}>Sessions</Text>
        <Text style={styles.sessionValue}>
          {todayAttendance.totalSessions || 1}
        </Text>
      </View>

      <View style={styles.sessionDetail}>
        <MaterialIcons name="event-available" size={16} color="#6B7280" />
        <Text style={styles.sessionLabel}>Day Status</Text>
        <Text
          style={[
            styles.sessionValue,
            {
              color: todayDisplayStatus === "Present" ? "#10B981" : "#EF4444",
              fontWeight: "600",
            },
          ]}
        >
          {todayDisplayStatus}
        </Text>
      </View>
    </View>
  );
});

const HistoryRow = memo(function HistoryRow({ record }) {
  const displayStatus = record.oldestCheckIn ? "Present" : record.status;
  const isPresent = displayStatus === "Present";

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyDate}>{formatDate(record.date)}</Text>
        <Text style={styles.historyMeta}>
          {record.totalSessions || 1} session
          {(record.totalSessions || 1) !== 1 ? "s" : ""}
          {" · "}
          {formatTime(record.oldestCheckIn)}
          {record.latestCheckOut
            ? ` – ${formatTime(record.latestCheckOut)}`
            : " – ongoing"}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <View
          style={[
            styles.historyBadge,
            { backgroundColor: isPresent ? "#D1FAE5" : "#FEE2E2" },
          ]}
        >
          <Text
            style={[
              styles.historyBadgeText,
              { color: isPresent ? "#065F46" : "#991B1B" },
            ]}
          >
            {displayStatus}
          </Text>
        </View>
        <Text style={styles.historyDuration}>
          {record.totalDurationFormatted || "0h 0m"}
        </Text>
      </View>
    </View>
  );
});

const HistoryList = memo(function HistoryList({
  sortedHistory,
  visibleCount,
  onLoadMore,
}) {
  if (sortedHistory.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>Recent History</Text>
      {sortedHistory.slice(0, visibleCount).map((record) => (
        <HistoryRow key={record.date} record={record} />
      ))}

      {sortedHistory.length > visibleCount && (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={onLoadMore}>
          <Text style={styles.loadMoreText}>Show More</Text>
          <MaterialIcons name="expand-more" size={20} color="#0F2D52" />
        </TouchableOpacity>
      )}
    </>
  );
});

// ─── component ──────────────────────────────────────────────────────────────

export default function Attend() {
  const [user, setUser] = useState(null);
  const [distance, setDistance] = useState(null);
  const [isInsideOffice, setIsInsideOffice] = useState(false);
  const [isMocked, setIsMocked] = useState(false);
  const [storeName, setStoreName] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayPunch, setTodayPunch] = useState({ checkIn: null, checkOut: null });
  const [currentStatus, setCurrentStatus] = useState("CHECKED_OUT");
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [activeCheckIn, setActiveCheckIn] = useState(null);

  const refreshAttendanceDataRef = useRef(null);

  // ── STEP 1: Load from in-memory cache instantly (no API call) ────────────
  const loadFromCache = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem("userData");
      const user = JSON.parse(userData);

      if (attendanceService.cachedEmployeeNumber !== user.employeeNumber) {
        attendanceService.clearAll();
        setCurrentStatus("CHECKED_OUT");
        setTodayAttendance(null);
        setActiveCheckIn(null);
        setAttendanceHistory([]);
      }

      const cachedStatus = attendanceService.statusCache;
      const cachedOpenSession = attendanceService.openSessionCheckIn;

      if (cachedStatus) {
        setCurrentStatus(cachedStatus);
      }

      if (cachedOpenSession) {
        setActiveCheckIn(cachedOpenSession);
        const today = new Date().toISOString().split("T")[0];
        const isToday =
          new Date(cachedOpenSession).toISOString().split("T")[0] === today;
        if (isToday && cachedStatus === "CHECKED_IN") {
          setTodayAttendance({
            date: today,
            oldestCheckIn: cachedOpenSession,
            latestCheckOut: null,
            totalDurationMinutes: 0,
            totalSessions: 1,
            totalDurationFormatted: "0h 0m",
            status: "OPEN",
          });
        }
      }

      const lastLocRaw = await AsyncStorage.getItem("lastLocation");
      if (lastLocRaw) {
        const lastLoc = JSON.parse(lastLocRaw);
        setDistance(lastLoc.distance ?? null);
        setIsInsideOffice(lastLoc.isInside || false);
        setIsMocked(lastLoc.isMocked === true);
        setStoreName(lastLoc.storeName ?? null);
      }
    } catch (e) {
      console.log("[Attend] Cache load error (non-fatal):", e);
    }
  }, []);

  // ── STEP 2: Fetch fresh data from API in background ──────────────────────
  // Called on: app start, check-in success, check-out success, pull-to-refresh,
  // app returning from long background. NEVER called directly from a GPS tick —
  // GPS only calls this indirectly, via ATTENDANCE_UPDATED, when a check-in/out
  // actually happens.
  const refreshAttendanceData = useCallback(async () => {
    try {
      const userData = await AsyncStorage.getItem("userData");
      if (!userData) return;
      const parsedUser = JSON.parse(userData);
      const employeeNumber = parsedUser.employeeNumber;
      if (!employeeNumber) return;

      const [history] = await Promise.all([
        attendanceService.getAttendanceHistory(employeeNumber),
      ]);
      const today = new Date().toISOString().split("T")[0];
      const todayRecord = history.success
        ? history.data.find((a) => a.date === today) || null
        : null;

      const status = attendanceService._deriveStatus(history);

      const openSession = attendanceService.openSessionCheckIn;
      const openSessionIsToday =
        !!openSession &&
        new Date(openSession).toISOString().split("T")[0] === today;

      const effectiveTodayRecord =
        todayRecord ||
        (status === "CHECKED_IN" && openSession && openSessionIsToday
          ? {
            date: today,
            oldestCheckIn: openSession,
            latestCheckOut: null,
            totalDurationMinutes: 0,
            totalSessions: 1,
            totalDurationFormatted: "0h 0m",
            status: "OPEN",
          }
          : null);

      setCurrentStatus(status);
      setTodayAttendance(effectiveTodayRecord);
      setActiveCheckIn(openSessionIsToday ? openSession : null);
      if (history.success) setAttendanceHistory(history.data);

      locationService.getCurrentLocation().then((location) => {
        if (location) {
          setDistance(location.distance);
          setIsInsideOffice(location.isInside);
          setIsMocked(location.isMocked === true);
          setStoreName(location.storeName ?? null);
        }
      });
    } catch (error) {
      console.error("[Attend] Error refreshing:", error);
    }
  }, []);

  useEffect(() => {
    refreshAttendanceDataRef.current = refreshAttendanceData;
  }, [refreshAttendanceData]);

  // ── init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Fired only when a real check-in/out transition happens — not on every GPS tick.
    const handleAttendanceUpdate = () => {
      console.log("[Attend] ATTENDANCE_UPDATED received");
      refreshAttendanceDataRef.current?.();
    };

    // Fired on every GPS tick — deliberately does NOT touch attendance state,
    // so it never invalidates SessionCard / HistoryList memoization.
    const handleLocationUpdate = (data) => {
      setDistance(data.distance);
      setIsInsideOffice(data.isInside);
      setIsMocked(data.isMocked === true);
      setStoreName(data.storeName ?? null);
    };

    const init = async () => {
      try {
        const userData = await AsyncStorage.getItem("userData");
        if (!userData) {
          router.replace("/");
          return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setTodayPunch(await loadTodayPunch(parsedUser.employeeNumber));

        await loadFromCache();
        refreshAttendanceData();
      } catch (error) {
        console.error("[Attend] Init error:", error);
      }
    };

    eventEmitter.on("ATTENDANCE_UPDATED", handleAttendanceUpdate);
    eventEmitter.on("LOCATION_UPDATED", handleLocationUpdate);
    init();

    return () => {
      eventEmitter.off("ATTENDANCE_UPDATED", handleAttendanceUpdate);
      eventEmitter.off("LOCATION_UPDATED", handleLocationUpdate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    attendanceService.clearStatusCache();
    await refreshAttendanceData();
    setRefreshing(false);
  }, [refreshAttendanceData]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 10);
  }, []);

  // Manual Check In / Check Out (location is verified in locationService)
  // `submitting` holds which button is busy: "in" | "out" | false
  const handleAttendanceAction = useCallback(async (action) => {
    if (submitting) return;
    const checkingOut = action === "out";

    setSubmitting(action);
    try {
      const result = checkingOut
        ? await locationService.manualCheckOut()
        : await locationService.manualCheckIn();

      if (result.success) {
        setCurrentStatus(checkingOut ? "CHECKED_OUT" : "CHECKED_IN");

        // Show the time right away. A new check-in clears the old check-out.
        const nextPunch = checkingOut
          ? { ...todayPunch, checkOut: result.time }
          : { checkIn: result.time, checkOut: null };
        setTodayPunch(nextPunch);
        saveTodayPunch(user?.employeeNumber, nextPunch);

        Alert.alert(
          checkingOut ? "Checked Out ✓" : "Checked In ✓",
          result.message
        );
      } else {
        Alert.alert(
          checkingOut ? "Cannot Check Out" : "Cannot Check In",
          result.message
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, todayPunch, user]);

  // ── derived ──────────────────────────────────────────────────────────────
  const isCheckedIn = currentStatus === "CHECKED_IN";
  const statusColor = isCheckedIn ? "#10B981" : "#EF4444";
  const statusLabel = isCheckedIn ? "Checked In" : "Not In";

  const todayDisplayStatus = isCheckedIn
    ? "Present"
    : todayAttendance?.latestCheckOut
      ? "Present"
      : todayAttendance?.oldestCheckIn
        ? "Present"
        : todayAttendance?.status || "Absent";

  const sortedHistory = useMemo(
    () =>
      [...attendanceHistory].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [attendanceHistory]
  );

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header stays fixed while the page scrolls */}
      <View style={styles.header}>
        <Text style={styles.headerTag}>ATTENDANCE HUB</Text>
        <Text style={styles.headerTitle}>My Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Track attendance and office status
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
      {isMocked && (
        <View style={styles.mockBanner}>
          <MaterialIcons name="gps-off" size={22} color="#B91C1C" />
          <Text style={styles.mockText}>{MOCK_LOCATION_MESSAGE}</Text>
        </View>
      )}

      <StatsRow
        statusColor={statusColor}
        statusLabel={statusLabel}
        distance={distance}
        isInsideOffice={isInsideOffice}
      />

      {/* Manual Check In / Check Out */}
      <View style={styles.actionCard}>
        <View style={styles.actionInfoRow}>
          <MaterialIcons
            name={isMocked ? "gps-off" : isInsideOffice ? "store" : "location-off"}
            size={20}
            color={isMocked ? "#B91C1C" : isInsideOffice ? "#10B981" : "#D96A17"}
          />
          <Text style={styles.actionInfoText}>
            {isMocked
              ? "Fake location detected — attendance blocked"
              : isInsideOffice
                ? `You're at ${storeName || "the store"}`
                : distance == null
                  ? "Getting your location…"
                  : `You must be within ${MAX_DISTANCE} m of a store (now ${Math.round(distance)} m away)`}
          </Text>
        </View>

        {/* Today's check-in / check-out times */}
        <View style={styles.actionTimesRow}>
          <View style={styles.actionTimeBox}>
            <Text style={styles.actionTimeLabel}>Check In</Text>
            <Text style={styles.actionTimeValue}>
              {formatTime(
                todayPunch.checkIn ||
                  (isCheckedIn && activeCheckIn
                    ? activeCheckIn
                    : todayAttendance?.oldestCheckIn)
              )}
            </Text>
          </View>
          <View style={styles.actionTimeBox}>
            <Text style={styles.actionTimeLabel}>Check Out</Text>
            <Text
              style={[
                styles.actionTimeValue,
                isCheckedIn && { color: "#10B981", fontSize: 13 },
              ]}
            >
              {isCheckedIn
                ? "Active session"
                : formatTime(todayPunch.checkOut || todayAttendance?.latestCheckOut)}
            </Text>
          </View>
        </View>

        {/* Both buttons; only the one that applies is enabled */}
        <View style={styles.actionButtonsRow}>
          {[
            { key: "in", label: "Check In", icon: "login", color: "#10B981", enabled: !isCheckedIn },
            { key: "out", label: "Check Out", icon: "logout", color: "#EF4444", enabled: isCheckedIn },
          ].map((btn) => {
            const busy = submitting === btn.key;
            const disabled = !btn.enabled || !!submitting;

            return (
              <TouchableOpacity
                key={btn.key}
                style={[
                  styles.actionButton,
                  { backgroundColor: btn.enabled ? btn.color : "#E5E7EB" },
                  disabled && !busy && btn.enabled && styles.actionButtonDisabled,
                ]}
                onPress={() => handleAttendanceAction(btn.key)}
                disabled={disabled}
                activeOpacity={0.8}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons
                      name={btn.icon}
                      size={18}
                      color={btn.enabled ? "#fff" : "#9CA3AF"}
                    />
                    <Text
                      style={[
                        styles.actionButtonText,
                        !btn.enabled && { color: "#9CA3AF" },
                      ]}
                    >
                      {btn.label}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Today's Session</Text>

      <SessionCard
        todayAttendance={todayAttendance}
        isCheckedIn={isCheckedIn}
        statusColor={statusColor}
        statusLabel={statusLabel}
        activeCheckIn={activeCheckIn}
        todayDisplayStatus={todayDisplayStatus}
      />

      <View style={styles.autoCard}>
        <MaterialIcons name="gps-fixed" size={20} color="#D96A17" />
        <Text style={styles.autoText}>
          Tap Check In when you arrive and Check Out before you leave. Both
          work only within {MAX_DISTANCE} m of a store.
        </Text>
      </View>

      <HistoryList
        sortedHistory={sortedHistory}
        visibleCount={visibleCount}
        onLoadMore={handleLoadMore}
      />

      <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ─── styles (unchanged) ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3EEE8" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3EEE8",
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
  headerTag: { color: "#F5A623", fontWeight: "800", letterSpacing: 1.2, fontSize: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 3 },
  headerSubtitle: { color: "#D5DCE5", fontSize: 12, marginTop: 3 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    marginTop: 10,
  },
  statCard: {
    backgroundColor: "#fff",
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statLabel: { fontSize: 11, color: "#777", marginTop: 6 },
  statValue: { fontSize: 13, fontWeight: "bold", color: "#0F2D52", marginTop: 2, textAlign: "center" },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0F2D52",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  sessionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sessionDate: { fontSize: 15, fontWeight: "bold", color: "#0F2D52" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  durationBlock: {
    backgroundColor: "#FFF4EC",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  durationLabel: { flex: 1, fontSize: 13, color: "#92400E", fontWeight: "500" },
  durationValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#D96A17",
    fontVariant: ["tabular-nums"],
  },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 12 },
  sessionDetail: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sessionLabel: { flex: 1, fontSize: 13, color: "#6B7280" },
  sessionValue: { fontSize: 13, fontWeight: "600", color: "#111827" },
  emptyCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    elevation: 2,
  },
  emptyText: { fontSize: 15, fontWeight: "600", color: "#6B7280", marginTop: 12 },
  emptySubText: { fontSize: 13, color: "#9CA3AF", marginTop: 6, textAlign: "center" },
  autoCard: {
    backgroundColor: "#FFF4EC",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  autoText: { flex: 1, fontSize: 12, color: "#D96A17", lineHeight: 18 },
  actionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  actionInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  actionInfoText: { flex: 1, fontSize: 13, color: "#374151", fontWeight: "600" },
  actionTimesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  actionTimeBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionTimeLabel: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  actionTimeValue: { marginTop: 2, fontSize: 15, color: "#111827", fontWeight: "700" },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  mockBanner: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mockText: { flex: 1, fontSize: 13, color: "#B91C1C", fontWeight: "600", lineHeight: 18 },
  historyCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  historyLeft: { flex: 1, gap: 4 },
  historyDate: { fontSize: 14, fontWeight: "700", color: "#0F2D52" },
  historyMeta: { fontSize: 12, color: "#9CA3AF" },
  historyRight: { alignItems: "flex-end", gap: 6 },
  historyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: "700" },
  historyDuration: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 2, marginTop: 8, marginBottom: 20, paddingLeft: 20, paddingRight: 14, paddingVertical: 9, backgroundColor: "#E1E7F0", borderRadius: 20 },
  loadMoreText: { color: "#0F2D52", fontSize: 14, fontWeight: "700" },
});