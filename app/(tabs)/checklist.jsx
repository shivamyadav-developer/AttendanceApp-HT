// Drawer → Checklist: the checklists for the logged-in user's role.
//
// Everything comes from GET /checklist/templates: a user only sees templates
// whose `role` matches their own (userData.role), e.g. STORE_MANAGER → Staff
// Checklist (Store Karta), VM → VM Checklist. New templates the backend adds
// (e.g. Daily Store Operation) appear automatically for their role.
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AppDrawer from "../../components/AppDrawer";
import ChecklistForm, { localDateKey } from "../../components/checklist/ChecklistForm";
import checklistService from "../../services/checklist.service";
import { allItems, checklistProgress, draftKey } from "../../utils/checklists";
import { checklistFromTemplate } from "../../utils/checklists/fromTemplate";

const NAVY = "#0F2D52";
const GREEN = "#10B981";

// Card name / icon / colour per template (matched on the template title)
const DISPLAYS = [
  { match: /store karta/i, title: "Staff Checklist", icon: "clipboard-check-outline", color: "#D96A17" },
  { match: /\bvm\b|visual merch/i, title: "VM Checklist", icon: "palette-outline", color: "#4A6FA5" },
  {
    match: /store staff|daily store|store operation|floor walk/i,
    title: "Daily Store Operation",
    icon: "store-check-outline",
    color: "#0F7A5C",
  },
];
const displayFor = (t) =>
  DISPLAYS.find((d) => d.match.test(t.title || "")) || {
    title: t.title,
    icon: "clipboard-list-outline",
    color: NAVY,
  };

const sameRole = (a, b) => !!a && !!b && String(a).toUpperCase() === String(b).toUpperCase();

// Today's status for each checklist, from its saved draft
const loadStatuses = async (checklists) => {
  const raw = await AsyncStorage.getItem("userData");
  const employeeNumber = raw ? JSON.parse(raw)?.employeeNumber : null;
  const entries = await Promise.all(
    checklists.map(async (c) => {
      try {
        const draft = JSON.parse((await AsyncStorage.getItem(draftKey(c.id))) || "null");
        if (draft?.date !== localDateKey() || draft?.employeeNumber !== employeeNumber) {
          return [c.id, null];
        }
        const p = checklistProgress(c, draft.answers || {});
        return [c.id, { ...p, submittedAt: draft.submittedAt, result: draft.result }];
      } catch {
        return [c.id, null];
      }
    })
  );
  return Object.fromEntries(entries);
};

export default function Checklists() {
  const [openId, setOpenId] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [checklists, setChecklists] = useState([]); // for this user's role
  const [userRole, setUserRole] = useState(null);
  const [loadState, setLoadState] = useState({ loading: true, error: null, fromCache: false });

  const loadTemplates = useCallback(async () => {
    setLoadState((prev) => ({ ...prev, loading: true, error: null }));
    const raw = await AsyncStorage.getItem("userData");
    const role = raw ? JSON.parse(raw)?.role : null;
    setUserRole(role);

    const res = await checklistService.getTemplates();
    if (!res.success) {
      setLoadState({ loading: false, error: res.message || "Could not load checklists.", fromCache: false });
      return;
    }
    const mine = res.data.filter((t) => t?.isActive !== false && sameRole(t.role, role));
    setChecklists(
      mine.map((t) => {
        const display = displayFor(t);
        // Several templates with the same short name (e.g. three VM checklists):
        // show each one's own API title so they can be told apart
        const shared = mine.some((o) => o !== t && displayFor(o).title === display.title);
        return shared
          ? { ...checklistFromTemplate(t, { ...display, title: t.title }), subtitle: t.description || t.title }
          : checklistFromTemplate(t, display);
      })
    );
    setLoadState({ loading: false, error: null, fromCache: !!res.fromCache });
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const refresh = useCallback(() => {
    loadStatuses(checklists).then(setStatuses).catch(() => {});
  }, [checklists]);

  useFocusEffect(refresh);

  const close = useCallback(() => {
    setOpenId(null);
    refresh();
  }, [refresh]);

  // Android back button: from a checklist, go back to the list
  useEffect(() => {
    if (!openId) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [openId, close]);

  const open = checklists.find((c) => c.id === openId);
  if (open) return <ChecklistForm checklist={open} onBack={close} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.menuBox}>
            <AppDrawer section="staff" role="Store Staff" iconColor="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTag}>STORE CHECKLISTS</Text>
            <Text style={styles.headerTitle}>Checklist</Text>
            <Text style={styles.headerSubtitle}>Choose a checklist to fill in for today</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
        {loadState.loading && !checklists.length ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color="#D96A17" />
            <Text style={styles.stateText}>Loading checklists…</Text>
          </View>
        ) : loadState.error ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={36} color="#B91C1C" />
            <Text style={[styles.stateText, { color: "#B91C1C" }]}>{loadState.error}</Text>
            <Pressable onPress={loadTemplates} hitSlop={8} style={styles.retryBtn}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !checklists.length ? (
          <View style={styles.stateBox}>
            <MaterialCommunityIcons name="clipboard-off-outline" size={40} color="#9CA3AF" />
            <Text style={styles.stateTitle}>No checklist for your role</Text>
            <Text style={styles.stateText}>
              {userRole
                ? `There is no checklist assigned to ${String(userRole).replace(/_/g, " ")}.`
                : "Your role is not set."}
              {"\n"}Contact your manager if you think this is wrong.
            </Text>
          </View>
        ) : null}

        {checklists.map((c) => {
          const s = statuses[c.id];
          const pct = s ? Math.round((s.complete / s.total) * 100) : 0;
          const status = s?.submittedAt
            ? { label: "Completed", color: GREEN, bg: "#D1FAE5", icon: "checkmark-circle" }
            : s && s.complete > 0
              ? { label: `In progress · ${pct}%`, color: "#D96A17", bg: "#FFF4EC", icon: "time-outline" }
              : { label: "Not started", color: "#6B7280", bg: "#F3F4F6", icon: "ellipse-outline" };
          // After submitting, the answers are cleared — use the saved result
          const scorePct =
            s?.result?.compliancePercentage ??
            s?.result?.scorePct ??
            (s?.max ? Math.round((s.achieved / s.max) * 100) : null);
          const scoreLabel = s?.result?.compliancePercentage != null ? "Compliance" : "Score";

          return (
            <Pressable
              key={c.id}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() => setOpenId(c.id)}
            >
              <View style={[styles.cardIcon, { backgroundColor: `${c.color}1A` }]}>
                <MaterialCommunityIcons name={c.icon} size={22} color={c.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Text style={styles.cardSub}>{c.subtitle}</Text>
                <Text style={styles.cardMeta}>
                  {c.sections.length} sections · {allItems(c).length} items
                  {c.scored ? " · scored" : ""}
                  {loadState.fromCache ? " · offline copy" : ""}
                </Text>

                <View style={styles.cardFooter}>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <Ionicons name={status.icon} size={13} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  {s?.submittedAt && scorePct != null && (
                    <Text style={styles.scoreText}>{scoreLabel} {scorePct}%</Text>
                  )}
                </View>

                {s && !s.submittedAt && s.complete > 0 && (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.color }]} />
                  </View>
                )}
              </View>

              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          );
        })}

        {checklists.length > 0 && (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color="#D96A17" />
            <Text style={styles.noteText}>
              Answers are saved on this phone as you go, and a new checklist starts each day.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3EEE8" },
  header: {
    backgroundColor: NAVY,
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  menuBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  headerTag: { color: "#F5A623", fontWeight: "800", letterSpacing: 1.2, fontSize: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 3 },
  headerSubtitle: { color: "#D5DCE5", fontSize: 12, marginTop: 3 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: NAVY },
  cardSub: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  cardMeta: { fontSize: 10, color: "#9CA3AF", marginTop: 2 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  scoreText: { fontSize: 12, fontWeight: "700", color: GREEN },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#F3F4F6",
    marginTop: 8,
    overflow: "hidden",
  },
  fill: { height: 5, borderRadius: 3 },

  stateBox: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 20, gap: 8 },
  stateTitle: { fontSize: 16, fontWeight: "800", color: NAVY, marginTop: 4 },
  stateText: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 8,
    backgroundColor: "#D96A17",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF4EC",
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  noteText: { flex: 1, fontSize: 12, color: "#D96A17", lineHeight: 18 },
});
