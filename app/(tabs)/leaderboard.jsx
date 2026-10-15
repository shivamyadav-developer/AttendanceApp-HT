// app/(tabs)/leaderboard.jsx
// Sales leaderboard: All Stores / My Store, with the user's own rank.
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dashboardService from "../../services/dashboard.service";

const MEDAL_COLORS = ["#D4A017", "#9CA3AF", "#B87333"]; // gold, silver, bronze

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// Green when target met, orange when close, red when far behind
function progressColor(pct) {
  if (pct >= 100) return "#1A8F4C";
  if (pct >= 75) return "#D86A16";
  return "#C0392B";
}

// "2026-10-01" → "1 Oct"
function shortDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// One entry per storeId. The API spells some store names differently
// across rows, so use the most common spelling for each store.
function buildStoreList(rows) {
  const byId = {};
  rows.forEach((r) => {
    if (r.storeId == null) return;
    const id = String(r.storeId);
    const entry = (byId[id] = byId[id] || { storeId: id, count: 0, names: {} });
    entry.count += 1;
    const name = r.storeName.trim();
    if (name) entry.names[name] = (entry.names[name] || 0) + 1;
  });

  return Object.values(byId)
    .map((s) => ({
      storeId: s.storeId,
      count: s.count,
      name:
        Object.entries(s.names).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        `Store ${s.storeId}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [myEmployeeId, setMyEmployeeId] = useState("");
  const [myStoreId, setMyStoreId] = useState(null);
  // "all" | "store" (my store) | "pick" (store chosen from the list)
  const [scope, setScope] = useState("all");
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    try {
      setError(null);
      setLeaderboard(await dashboardService.getLeaderboard());
    } catch (e) {
      console.warn("Leaderboard Error:", e?.message);
      setError(e.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("userData");
        const user = raw ? JSON.parse(raw) : null;
        setMyEmployeeId(String(user?.employeeNumber ?? ""));
        // siteId matches the leaderboard's storeId (used for "My Store")
        setMyStoreId(user?.siteId ?? null);
      } catch { }
    })();
    loadLeaderboard();
  }, [loadLeaderboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLeaderboard();
  };

  const stores = useMemo(
    () => buildStoreList(leaderboard?.rows || []),
    [leaderboard]
  );

  // Store currently filtered on (null = all stores)
  const activeStoreId =
    scope === "store" ? myStoreId : scope === "pick" ? selectedStoreId : null;
  const activeStore = stores.find((s) => s.storeId === String(activeStoreId));

  // Filter to one store and re-rank within it
  const rows = useMemo(() => {
    const all = leaderboard?.rows || [];
    if (activeStoreId == null) return all;
    return all
      .filter((r) => String(r.storeId) === String(activeStoreId))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [leaderboard, activeStoreId]);

  const me = rows.find((r) => r.employeeId === myEmployeeId);

  const pickStore = (storeId) => {
    setSelectedStoreId(storeId);
    setScope("pick");
    setStorePickerOpen(false);
  };

  // ─── Render ──────────────────────────────────────────────────────

  const renderRow = ({ item: r }) => {
    const isMe = r.employeeId === myEmployeeId;
    const medal = r.rank <= 3 ? MEDAL_COLORS[r.rank - 1] : null;

    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        {medal ? (
          // Top 3: solid gold / silver / bronze circle with the rank number,
          // and a matching crown on top
          <View style={styles.rankMedalWrap}>
            <MaterialCommunityIcons
              name="crown"
              size={20}
              color={medal}
              style={styles.rankCrown}
            />
            <View style={[styles.rank, styles.rankMedal, { backgroundColor: medal }]}>
              <Text style={styles.rankMedalText}>{r.rank}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.rank, isMe && styles.rankMe]}>
            <Text style={[styles.rankText, isMe && { color: "#fff" }]}>{r.rank}</Text>
          </View>
        )}

        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.name} numberOfLines={1}>
            {r.name}{isMe ? "  (You)" : ""}
          </Text>
          <Text style={styles.store} numberOfLines={1}>
            {activeStoreId != null ? r.department || r.storeName : r.storeName}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.achieved}>{formatCurrency(r.achieved)}</Text>
          <Text
            style={[
              styles.pct,
              { color: r.target ? progressColor(r.achievementPercentage) : "#9CA3AF" },
            ]}
          >
            {r.target ? `${r.achievementPercentage}% of target` : "No target"}
          </Text>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      {/* All Stores / My Store / Select Store */}
      <View style={styles.tabs}>
        {[
          { key: "all", label: "All Stores", show: true },
          { key: "store", label: "My Store", show: myStoreId != null },
          { key: "pick", label: "Select Store", show: stores.length > 0 },
        ]
          .filter((t) => t.show)
          .map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, scope === t.key && styles.tabActive]}
              onPress={() =>
                t.key === "pick" ? setStorePickerOpen(true) : setScope(t.key)
              }
            >
              <Text style={[styles.tabText, scope === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
      </View>

      {/* Chosen store — tap to change */}
      {scope === "pick" && activeStore && (
        <TouchableOpacity
          style={styles.storeChip}
          onPress={() => setStorePickerOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="storefront-outline" size={18} color="#D86A16" />
          <Text style={styles.storeChipText} numberOfLines={1}>
            {activeStore.name}
          </Text>
          <Text style={styles.storeChipChange}>Change</Text>
          <Ionicons name="chevron-down" size={16} color="#0F2D52" />
        </TouchableOpacity>
      )}

      {/* My rank */}
      <View style={styles.myRank}>
        <Ionicons name="person-circle-outline" size={26} color="#0F2D52" />
        <View style={{ flex: 1 }}>
          <Text style={styles.myRankTitle}>
            {me
              ? `Your rank #${me.rank} of ${rows.length}`
              : scope === "pick"
                ? `${rows.length} staff in this store`
                : "You're not on this leaderboard yet"}
          </Text>
          {!!me && (
            <Text style={styles.myRankSub}>
              {formatCurrency(me.achieved)}
              {me.target ? ` · ${me.achievementPercentage}% of target` : ""}
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header stays fixed while the list scrolls */}
      <View style={styles.header}>
        <Text style={styles.smallTitle}>SALES LEADERBOARD</Text>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.subtitle}>
          {leaderboard?.startDate
            ? `${shortDate(leaderboard.startDate)} – ${shortDate(leaderboard.endDate)} · ranked by sales achieved`
            : "Ranked by sales achieved"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#D86A16" />
          <Text style={styles.centerText}>Loading leaderboard...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={46} color="#D86A16" />
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadLeaderboard}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => `${scope}-${r.employeeId}-${r.rank}`}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<Text style={styles.empty}>No data for this period.</Text>}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#D86A16"]} />
          }
          initialNumToRender={20}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Store picker */}
      <Modal
        visible={storePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStorePickerOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStorePickerOpen(false)} />

          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Store</Text>
              <TouchableOpacity onPress={() => setStorePickerOpen(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={stores}
              keyExtractor={(s) => s.storeId}
              renderItem={({ item: s }) => {
                const isSelected = scope === "pick" && s.storeId === String(selectedStoreId);
                const isMine = myStoreId != null && s.storeId === String(myStoreId);
                return (
                  <TouchableOpacity
                    style={[styles.storeRow, isSelected && styles.storeRowSelected]}
                    onPress={() => pickStore(s.storeId)}
                  >
                    <Ionicons
                      name="storefront-outline"
                      size={20}
                      color={isSelected ? "#D86A16" : "#0F2D52"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.storeRowName} numberOfLines={2}>
                        {s.name}
                      </Text>
                      <Text style={styles.storeRowMeta}>
                        {s.count} staff{isMine ? " · Your store" : ""}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color="#D86A16" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.storeSeparator} />}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FA" },

  // Header (same as LMS)
  header: {
    backgroundColor: "#0F2D52",
    height: 160,
    paddingTop: 50,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  smallTitle: { color: "#F5A623", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 3 },
  subtitle: { color: "#D5DCE5", fontSize: 12, marginTop: 3 },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  centerText: { marginTop: 10, color: "#666", fontSize: 14, textAlign: "center" },
  retryButton: {
    backgroundColor: "#D86A16",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
  },
  retryText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  listContent: { padding: 14, paddingBottom: 30 },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#E9ECF1",
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#fff", elevation: 1 },
  tabText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#0F2D52", fontWeight: "800" },

  myRank: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  myRankTitle: { fontSize: 15, fontWeight: "800", color: "#0F2D52" },
  myRankSub: { fontSize: 12, color: "#555", marginTop: 2, fontWeight: "600" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  rowMe: { backgroundColor: "#FFF5EC", borderWidth: 1, borderColor: "#F3C9A5" },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EEF1F5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rankText: { fontSize: 12, fontWeight: "800", color: "#374151" },
  rankMe: { backgroundColor: "#D86A16" },
  rankMedal: {
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  rankMedalText: { fontSize: 13, fontWeight: "900", color: "#fff" },
  // Crown floats above the circle (inside the row's top padding)
  rankMedalWrap: { position: "relative" },
  rankCrown: {
    position: "absolute",
    top: -14,
    left: 5, // centred over the 30px circle (30 - 20) / 2
    zIndex: 1,
  },
  name: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  store: { fontSize: 11, color: "#777", marginTop: 1 },
  achieved: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  pct: { fontSize: 11, fontWeight: "700", marginTop: 1 },

  empty: { textAlign: "center", color: "#777", marginTop: 20 },

  // Selected-store chip
  storeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F3C9A5",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  storeChipText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  storeChipChange: { fontSize: 12, fontWeight: "700", color: "#0F2D52" },

  // Store picker sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "75%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: "#0F2D52" },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  storeRowSelected: { backgroundColor: "#FFF5EC" },
  storeRowName: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  storeRowMeta: { fontSize: 12, color: "#777", marginTop: 2 },
  storeSeparator: { height: 1, backgroundColor: "#F0F0F0" },
});
