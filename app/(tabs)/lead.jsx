import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { useFocusEffect } from "expo-router";

import {
  CALL_OUTCOME_STATUSES,
  CRM_LEAD_STATUSES,
  crmStatusAfterCall,
  getCrmStatusInfo,
  getQRLeads,
  markLeadCalled,
  updateLeadStatus,
} from "../../services/lead";

// =========================================================
// HELPERS
// =========================================================

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// "NOT_INTERESTED" → "Not Interested" (label from the CRM list when known)
const prettyStatus = (value) =>
  getCrmStatusInfo(value)?.label ||
  String(value || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ") ||
  "-";

// The lead's real progress: converted → CRM status → sync status.
// (`status` is only the CRM sync state, e.g. "SYNCED", so it never changes
//  after a call; `crmStatus` does.)
const getLeadStatus = (lead) =>
  lead?.isConverted ? "CONVERTED" : lead?.crmStatus || lead?.status;

// Only 3 badges are shown in the list:
//   New Lead  |  In Progress  |  Closed
// Each CRM status (CRM_LEAD_STATUSES) has a `stage` that picks the badge.
const STAGE_COLORS = {
  new: { label: "New Lead", bg: "#FDEBDD", text: "#EA580C" },
  progress: { label: "In Progress", bg: "#DBEAFE", text: "#2563EB" },
  closed: { label: "Closed", bg: "#DCFCE7", text: "#16A34A" },
};

const getStatusColors = (status) => {
  const stage = getCrmStatusInfo(status)?.stage;
  if (stage) return STAGE_COLORS[stage];

  // Older / non-CRM values
  switch (String(status || "").toUpperCase()) {
    case "CLOSED":
    case "COMPLETED":
    case "REJECTED":
      return STAGE_COLORS.closed;
    case "IN_PROGRESS":
    case "SYNCED":
      return STAGE_COLORS.progress;
    default:
      // SUBMITTED / empty / anything else
      return STAGE_COLORS.new;
  }
};

const callCustomer = (mobile) => {
  if (!mobile) return;

  Linking.openURL(`tel:${mobile}`);
};

// =========================================================
// CALL LOGS (saved locally on the device for testing)
//
// Stored in AsyncStorage under "leadCallLogs" as:
// { [leadKey]: [ { id, startedAt, endedAt, durationSeconds, notes, ... } ] }
//
// Later this can be replaced with an API call (POST /qrleads/:id/calls)
// by changing only upsertCallLog / readAllCallLogs below.
// =========================================================
const CALL_LOG_KEY = "leadCallLogs";

// Leads shown at a time in the list
const PAGE_SIZE = 10;

// =========================================================
// MICROPHONE RECORDING (expo-audio)
//
// expo-audio always writes the recording into the temporary cache,
// so when the call ends the file is moved into the app's permanent
// storage (see keepRecording).
// =========================================================
const RECORDING_OPTIONS = RecordingPresets.HIGH_QUALITY;

const RECORDING_FOLDER = "CallRecordings";

// Move a finished recording out of the cache. Returns the new file path.
const keepRecording = (uri) => {
  try {
    const folder = new Directory(Paths.document, RECORDING_FOLDER);

    folder.create({ idempotent: true, intermediates: true });

    const file = new File(uri);

    file.move(folder);

    return file.uri;
  } catch (error) {
    console.error("Keep recording error:", error?.message || error);

    // Still playable from the cache until the system clears it
    return uri;
  }
};

const startRecorder = async (recorder) => {
  try {
    const permission = await AudioModule.requestRecordingPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Microphone permission needed",
        "Allow microphone access to record calls. The call will continue without recording."
      );

      return false;
    }

    // shouldPlayInBackground is required on Android: without it the
    // recorder is paused as soon as the dialer covers the app.
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();

    recorder.record();

    if (!recorder.getStatus().isRecording) {
      throw new Error("Recorder did not start");
    }

    return true;
  } catch (error) {
    console.error("Start recording error:", error?.message || error);

    // Release a half-prepared recorder so the next call can record
    try {
      await recorder.stop();
    } catch (stopError) {
      // ignore
    }

    Alert.alert(
      "Recording not started",
      "Could not start the microphone. The call will continue without recording."
    );

    return false;
  }
};

// Returns the saved file path (or null if nothing was recorded)
const stopRecorder = async (recorder) => {
  try {
    await recorder.stop();

    return recorder.uri ? keepRecording(recorder.uri) : null;
  } catch (error) {
    console.error("Stop recording error:", error?.message || error);

    return null;
  }
};

const getLeadKey = (lead) =>
  String(lead?._id || lead?.id || lead?.leadId || lead?.mobile || "");

const readAllCallLogs = async () => {
  try {
    const raw = await AsyncStorage.getItem(CALL_LOG_KEY);

    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("Read call logs error:", error?.message || error);

    return {};
  }
};

const writeAllCallLogs = async (all) => {
  try {
    await AsyncStorage.setItem(CALL_LOG_KEY, JSON.stringify(all));
  } catch (error) {
    console.error("Save call logs error:", error?.message || error);
  }
};

// Insert a new call entry, or replace it if the same id already exists.
// Returns the updated list of calls for that lead (newest first).
const upsertCallLog = async (entry) => {
  const all = await readAllCallLogs();

  const list = Array.isArray(all[entry.leadKey]) ? all[entry.leadKey] : [];

  const index = list.findIndex((item) => item.id === entry.id);

  if (index >= 0) {
    list[index] = entry;
  } else {
    list.unshift(entry);
  }

  all[entry.leadKey] = list;

  await writeAllCallLogs(all);

  return list;
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "-";

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
};

// One label/value row (used in details view)
function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <MaterialIcons name={icon} size={16} color="#EA580C" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>

        <Text style={styles.detailValue}>{value || "-"}</Text>
      </View>
    </View>
  );
}

export default function LeadTab() {
  const [leads, setLeads] = useState([]);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");

  // How many leads are shown in the list ("Show More" adds 10 more)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // null = show list, object = show that lead's details
  const [selectedLead, setSelectedLead] = useState(null);

  // =========================================================
  // LOAD LEADS FOR LOGGED-IN USER'S STORE
  // =========================================================
  const loadLeads = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      // ---- logged-in user (header + store filter) ----
      let currentUser = null;

      try {
        const storedUser = await AsyncStorage.getItem("userData");

        currentUser = storedUser ? JSON.parse(storedUser) : null;
      } catch (userError) {
        currentUser = null;
      }

      setUser(currentUser);

      // Same store id that is sent when a lead is submitted
      const storeId = currentUser?.siteCode ?? currentUser?.siteId ?? "";

      const list = await getQRLeads({ storeId });

      // Newest first
      list.sort(
        (a, b) =>
          new Date(b?.submittedAt || b?.createdAt || 0) -
          new Date(a?.submittedAt || a?.createdAt || 0)
      );

      setLeads(list);
    } catch (error) {
      console.error("Load leads error:", error?.message || error);

      setErrorMessage(
        error?.message || "Something went wrong while loading leads."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the tab is opened (so a new lead shows up immediately)
  useFocusEffect(
    useCallback(() => {
      loadLeads(false);
    }, [loadLeads])
  );

  // Android back button: close details first, instead of leaving the tab
  useEffect(() => {
    if (!selectedLead) return undefined;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setSelectedLead(null);
        return true;
      }
    );

    return () => subscription.remove();
  }, [selectedLead]);

  // =========================================================
  // CALL RECORDING (details page)
  //
  // 1. Admin taps "Call" -> a call entry is saved immediately
  // 2. Dialer opens
  // 3. When admin comes back to the app, the call time is
  //    calculated and a "Call Conversation" popup asks for notes
  // =========================================================
  const [callLogs, setCallLogs] = useState([]);
  const [pendingCall, setPendingCall] = useState(null);
  const [noteText, setNoteText] = useState("");
  // CRM status picked in the Call Conversation popup
  const [callStatus, setCallStatus] = useState("CONTACTED");

  // Status dropdown on the details page
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const pendingCallRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const selectedLeadRef = useRef(null);

  selectedLeadRef.current = selectedLead;

  // Microphone recorder + playback of saved recordings
  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderRef = useRef(audioRecorder);

  recorderRef.current = audioRecorder;

  const [playingId, setPlayingId] = useState(null);
  const playerRef = useRef(null);

  // Load saved calls whenever a lead is opened
  useEffect(() => {
    if (!selectedLead) {
      setCallLogs([]);
      return undefined;
    }

    let cancelled = false;

    const loadCalls = async () => {
      const all = await readAllCallLogs();

      if (!cancelled) {
        setCallLogs(all[getLeadKey(selectedLead)] || []);
      }
    };

    loadCalls();

    return () => {
      cancelled = true;
    };
  }, [selectedLead]);

  // Tell the server this lead was called (PATCH /qrleads/:id) — once per call.
  // NEW leads move to CONTACTED; leads further along keep their status.
  // Status dropdown: confirm, then PATCH /qrleads/:id with the new crmStatus
  const changeLeadStatus = (lead, newStatus) => {
    setStatusPickerOpen(false);

    const current = lead?.isConverted ? "CONVERTED" : lead?.crmStatus || "NEW";
    if (!lead?._id || newStatus === current) return;

    const label = prettyStatus(newStatus);

    Alert.alert("Update status", `Change this lead to "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Update",
        onPress: async () => {
          try {
            setStatusUpdating(true);

            const by = user?.name ? ` — ${user.name}` : "";
            const updated = await updateLeadStatus(
              lead,
              newStatus,
              `Status changed to ${label}${by}`
            );

            setLeads((prev) =>
              prev.map((l) => (l?._id === updated._id ? { ...l, ...updated } : l))
            );
            setSelectedLead((prev) =>
              prev?._id === updated._id ? { ...prev, ...updated } : prev
            );
          } catch (error) {
            Alert.alert(
              "Status not updated",
              error?.message || "Please try again."
            );
          } finally {
            setStatusUpdating(false);
          }
        },
      },
    ]);
  };

  const syncCallToServer = async (call, notes, crmStatus) => {
    if (!call?.lead?._id) return;

    const duration = formatDuration(call.durationSeconds);
    const by = call.calledBy ? ` — ${call.calledBy}` : "";
    const comment = notes
      ? `${notes} (call ${duration}${by})`
      : `Called customer from app (call ${duration}${by})`;

    try {
      const updated = await markLeadCalled(call.lead, comment, crmStatus);

      // Show the new status / history right away
      setLeads((prev) =>
        prev.map((l) => (l?._id === updated._id ? { ...l, ...updated } : l))
      );

      if (selectedLeadRef.current?._id === updated._id) {
        setSelectedLead((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (error) {
      console.warn("Lead call update failed:", error?.message || error);
      Alert.alert(
        "Lead not updated",
        "The call was saved on this phone, but the lead could not be updated on the server. " +
          (error?.message || "")
      );
    }
  };

  // Detect the admin coming back to the app after the call
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextState) => {
        const wasAway = appStateRef.current !== "active";

        appStateRef.current = nextState;

        const pending = pendingCallRef.current;

        if (nextState !== "active" || !wasAway || !pending) return;

        pendingCallRef.current = null;

        // Stop the microphone and keep the saved file (if this call was recorded)
        let recordingUri = null;

        if (pending.withRecording) {
          recordingUri = await stopRecorder(recorderRef.current);
        }

        const finished = {
          ...pending,
          recordingUri,
          endedAt: new Date().toISOString(),
          durationSeconds: Math.max(
            0,
            Math.round(
              (Date.now() - new Date(pending.startedAt).getTime()) / 1000
            )
          ),
        };

        const isSameLeadOpen =
          selectedLeadRef.current &&
          getLeadKey(selectedLeadRef.current) === pending.leadKey;

        // Ask for notes only if the same lead page is still open
        // (the server is updated when the notes popup is saved/skipped).
        // Otherwise update the server now, without notes.
        if (isSameLeadOpen) {
          setNoteText("");
          setCallStatus(crmStatusAfterCall(finished.lead));
          setPendingCall(finished);
        } else {
          syncCallToServer(finished, "");
        }

        const list = await upsertCallLog(finished);

        if (isSameLeadOpen) {
          setCallLogs(list);
        }
      }
    );

    return () => subscription.remove();
  }, []);

  // Admin taps the call button on the details page.
  // Ask first (speaker + customer consent), then record and dial.
  const handleCallPress = (lead) => {
    if (!lead?.mobile) return;

    Alert.alert(
      "Record this call?",
      "Put the call on SPEAKER so the microphone can record both sides, and tell the customer the call is being recorded.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call without recording",
          onPress: () => startCall(lead, false),
        },
        {
          text: "Call & Record",
          onPress: () => startCall(lead, true),
        },
      ]
    );
  };

  const startCall = async (lead, withRecording) => {
    if (!lead?.mobile) return;

    // Stop any earlier recording that is still running
    if (pendingCallRef.current?.withRecording) {
      await stopRecorder(recorderRef.current);
    }

    const recordingStarted = withRecording
      ? await startRecorder(recorderRef.current)
      : false;

    const entry = {
      id: String(Date.now()),
      leadKey: getLeadKey(lead),
      customerName: lead?.customerName || "",
      mobile: lead.mobile,
      calledBy: user?.name || "",
      calledById: user?.employeeNumber ? String(user.employeeNumber) : "",
      // What the server update needs (id + current CRM status)
      lead: {
        _id: lead?._id,
        crmStatus: lead?.crmStatus,
        isConverted: lead?.isConverted,
      },
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
      notes: "",
      withRecording: recordingStarted,
      recordingUri: null,
    };

    // Remember this call so we can finish it when the admin returns
    pendingCallRef.current = entry;

    // Save right away so the call is recorded even if the app is closed
    const list = await upsertCallLog(entry);

    setCallLogs(list);

    callCustomer(lead.mobile);
  };

  // Save conversation notes from the popup
  const saveCallNotes = async () => {
    if (!pendingCall) return;

    const updated = { ...pendingCall, notes: noteText.trim() };

    setPendingCall(null);
    setNoteText("");

    // Notes go to the server as the call comment, with the chosen status
    syncCallToServer(updated, updated.notes, callStatus);

    const list = await upsertCallLog(updated);

    if (
      selectedLeadRef.current &&
      getLeadKey(selectedLeadRef.current) === updated.leadKey
    ) {
      setCallLogs(list);
    }
  };

  // Close the popup without notes (call time is already saved)
  const skipCallNotes = () => {
    // Still record the call on the server, just without notes
    if (pendingCall) syncCallToServer(pendingCall, "", callStatus);

    setPendingCall(null);
    setNoteText("");
  };

  // Stop and release the recording that is currently playing
  const stopPlayback = () => {
    const player = playerRef.current;

    playerRef.current = null;
    setPlayingId(null);

    if (!player) return;

    try {
      player.pause();
    } catch (error) {
      // ignore
    }

    try {
      if (typeof player.remove === "function") {
        player.remove();
      } else if (typeof player.release === "function") {
        player.release();
      }
    } catch (error) {
      // ignore
    }
  };

  // Play / stop a saved call recording
  const togglePlayback = async (log) => {
    if (!log?.recordingUri) return;

    if (playingId === log.id) {
      stopPlayback();
      return;
    }

    stopPlayback();

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const player = createAudioPlayer({ uri: log.recordingUri });

      playerRef.current = player;

      player.addListener("playbackStatusUpdate", (status) => {
        if (status?.didJustFinish) {
          stopPlayback();
        }
      });

      player.play();

      setPlayingId(log.id);
    } catch (error) {
      console.error("Play recording error:", error?.message || error);

      Alert.alert("Cannot play", "This recording could not be played.");
    }
  };

  // Stop playback when a different lead is opened / the details page closes
  useEffect(() => {
    return () => stopPlayback();
  }, [selectedLead]);

  // =========================================================
  // SEARCH (name / mobile / product code)
  // =========================================================
  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return leads;

    return leads.filter((item) => {
      const name = String(item?.customerName || "").toLowerCase();
      const mobile = String(item?.mobile || "");
      const products = (item?.products || []).join(" ");

      return (
        name.includes(query) ||
        mobile.includes(query) ||
        products.includes(query)
      );
    });
  }, [leads, search]);

  // Start again from the first 10 whenever the search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const visibleLeads = filteredLeads.slice(0, visibleCount);
  const hasMoreLeads = filteredLeads.length > visibleCount;

  // =========================================================
  // DETAILS VIEW (shown when a lead is tapped)
  // =========================================================
  if (selectedLead) {
    const lead = selectedLead;
    const statusColors = getStatusColors(getLeadStatus(lead));
    const products = Array.isArray(lead?.products) ? lead.products : [];

    return (
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.detailHeader}>
          <Pressable
            style={styles.headerBackButton}
            onPress={() => setSelectedLead(null)}
          >
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </Pressable>

          <Text style={styles.detailHeaderTitle}>Lead Details</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          {/* CUSTOMER HERO */}
          <View style={styles.heroCard}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>
                {String(lead?.customerName || "?")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <Text style={styles.heroName}>
              {lead?.customerName || "Unknown"}
            </Text>

            <Text style={styles.heroMobile}>{lead?.mobile || "-"}</Text>

            {/* Current CRM status — same pill style as the CRM card */}
            <View
              style={[
                styles.crmStatusPill,
                { backgroundColor: statusColors.bg, marginTop: 8, marginBottom: 0 },
              ]}
            >
              <Text style={[styles.crmStatusPillText, { color: statusColors.text }]}>
                {prettyStatus(
                  lead?.isConverted ? "CONVERTED" : lead?.crmStatus || "NEW"
                )}
              </Text>
            </View>

            {/* Dropdown to change the CRM status */}
            <Pressable
              style={[
                styles.heroStatusBadge,
                styles.heroStatusDropdown,
                { borderColor: statusColors.text },
              ]}
              onPress={() => setStatusPickerOpen(true)}
              disabled={statusUpdating}
              hitSlop={6}
            >
              {statusUpdating ? (
                <ActivityIndicator size="small" color={statusColors.text} />
              ) : (
                <>
                  <Text style={[styles.heroStatusText, { color: statusColors.text }]}>
                    Change Status
                  </Text>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={18}
                    color={statusColors.text}
                  />
                </>
              )}
            </Pressable>
          </View>

          {/* STATUS PICKER */}
          <Modal
            visible={statusPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setStatusPickerOpen(false)}
          >
            <Pressable
              style={styles.statusSheetOverlay}
              onPress={() => setStatusPickerOpen(false)}
            >
              <Pressable style={styles.statusSheet} onPress={() => {}}>
                <Text style={styles.statusSheetTitle}>Update CRM Status</Text>

                <ScrollView style={{ maxHeight: 420 }}>
                  {CRM_LEAD_STATUSES.map((s) => {
                    const current =
                      lead?.isConverted ? "CONVERTED" : lead?.crmStatus || "NEW";
                    const isCurrent = current === s.value;
                    const colors = getStatusColors(s.value);

                    return (
                      <Pressable
                        key={s.value}
                        style={[
                          styles.statusSheetRow,
                          isCurrent && { backgroundColor: colors.bg },
                        ]}
                        onPress={() => changeLeadStatus(lead, s.value)}
                      >
                        <View
                          style={[styles.statusSheetDot, { backgroundColor: colors.text }]}
                        />
                        <Text
                          style={[
                            styles.statusSheetText,
                            isCurrent && { color: colors.text, fontWeight: "800" },
                          ]}
                        >
                          {s.label}
                        </Text>
                        {isCurrent && (
                          <MaterialIcons name="check" size={20} color={colors.text} />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* LEAD INFO */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Lead Information</Text>

            <DetailRow
              icon="event"
              label="Created On"
              value={formatDate(lead?.submittedAt || lead?.createdAt)}
            />

            <DetailRow
              icon="store"
              label="Store"
              value={[
                lead?.storeName,
                lead?.storeId ? `(${lead.storeId})` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />

            <DetailRow
              icon="badge"
              label="Salesman"
              value={[
                lead?.salesmanName,
                lead?.salesmanId ? `(${lead.salesmanId})` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />

            {!!lead?.salesmanEmail && (
              <DetailRow
                icon="mail-outline"
                label="Salesman Email"
                value={lead.salesmanEmail}
              />
            )}
          </View>

          {/* PRODUCTS */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Scanned Products</Text>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{products.length}</Text>
              </View>
            </View>

            {products.length > 0 ? (
              products.map((code, index) => (
                <View key={`${code}-${index}`} style={styles.productItem}>
                  <View style={styles.tickCircle}>
                    <MaterialIcons name="check" size={17} color="#fff" />
                  </View>

                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={styles.productNumber}>
                      Product {index + 1}
                    </Text>

                    <Text style={styles.productCode}>{String(code)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>No products</Text>
            )}
          </View>

          {/* REMARKS */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Remarks</Text>

            <Text style={styles.remarksText}>
              {lead?.remarks?.trim() ? lead.remarks : "No remarks added."}
            </Text>
          </View>

          {/* CRM STATUS & COMMENTS (from the server: crmStatus, mobileCall, crmHistory) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>CRM Status & Comments</Text>

              <View
                style={[
                  styles.crmStatusPill,
                  { backgroundColor: getStatusColors(getLeadStatus(lead)).bg },
                ]}
              >
                <Text
                  style={[
                    styles.crmStatusPillText,
                    { color: getStatusColors(getLeadStatus(lead)).text },
                  ]}
                >
                  {prettyStatus(lead?.isConverted ? "CONVERTED" : lead?.crmStatus || "NEW")}
                </Text>
              </View>
            </View>

            <DetailRow
              icon={lead?.mobileCall?.called ? "phone-callback" : "phone-missed"}
              label="Customer Called"
              value={lead?.mobileCall?.called ? "Yes" : "Not yet"}
            />

            {!!lead?.crmUpdatedAt && (
              <DetailRow
                icon="update"
                label="Last CRM Update"
                value={formatDate(lead.crmUpdatedAt)}
              />
            )}

            {!!lead?.crmAgentName && (
              <DetailRow
                icon="support-agent"
                label="CRM Agent"
                value={lead.crmAgentName}
              />
            )}

            {/* Comment history, newest first */}
            {Array.isArray(lead?.crmHistory) && lead.crmHistory.length > 0 ? (
              [...lead.crmHistory]
                .sort(
                  (a, b) =>
                    new Date(b?.updatedAt || 0) - new Date(a?.updatedAt || 0)
                )
                .map((entry, index) => (
                  <View key={`${entry?.updatedAt}-${index}`} style={styles.crmHistoryItem}>
                    <View style={styles.crmHistoryDot} />

                    <View style={{ flex: 1 }}>
                      <View style={styles.crmHistoryHeader}>
                        <Text style={styles.crmHistoryStatus}>
                          {prettyStatus(entry?.crmStatus)}
                        </Text>
                        <Text style={styles.crmHistoryDate}>
                          {formatDate(entry?.updatedAt)}
                        </Text>
                      </View>

                      {!!entry?.comment && (
                        <Text style={styles.crmHistoryComment}>{entry.comment}</Text>
                      )}

                      {!!entry?.agentName && (
                        <Text style={styles.crmHistoryAgent}>By {entry.agentName}</Text>
                      )}
                    </View>
                  </View>
                ))
            ) : (
              <Text style={styles.noDataText}>
                No comments yet. Call the customer to add one.
              </Text>
            )}
          </View>

          {/* CALL HISTORY */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Call History</Text>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{callLogs.length}</Text>
              </View>
            </View>

            {callLogs.length > 0 ? (
              callLogs.map((log) => (
                <View key={log.id} style={styles.callLogItem}>
                  <View style={styles.callLogIcon}>
                    <MaterialIcons name="call-made" size={16} color="#fff" />
                  </View>

                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={styles.callLogTime}>
                      {formatDate(log.startedAt)}
                    </Text>

                    <Text style={styles.callLogMeta}>
                      Approx. call time: {formatDuration(log.durationSeconds)}
                      {log.calledBy ? `  •  By ${log.calledBy}` : ""}
                    </Text>

                    {!!log.notes && (
                      <Text style={styles.callLogNotes}>{log.notes}</Text>
                    )}

                    {/* RECORDING */}
                    {!!log.recordingUri && (
                      <Pressable
                        style={styles.playButton}
                        onPress={() => togglePlayback(log)}
                      >
                        <MaterialIcons
                          name={playingId === log.id ? "stop" : "play-arrow"}
                          size={18}
                          color="#fff"
                        />

                        <Text style={styles.playButtonText}>
                          {playingId === log.id
                            ? "Stop recording"
                            : "Play recording"}
                        </Text>
                      </Pressable>
                    )}

                    {!!log.withRecording && !log.recordingUri && (
                      <Text style={styles.noRecordingText}>
                        Recording in progress or not captured
                      </Text>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>No calls recorded yet.</Text>
            )}
          </View>
        </ScrollView>

        {/* STICKY CALL BAR */}
        <View style={styles.bottomBar}>
          <Pressable
            style={styles.bottomCallButton}
            onPress={() => handleCallPress(lead)}
          >
            <MaterialIcons name="call" size={22} color="#fff" />

            <Text style={styles.callButtonText}>
              Call {lead?.mobile || ""}
            </Text>
          </Pressable>
        </View>

        {/* CALL CONVERSATION POPUP (shown after returning from the call) */}
        <Modal
          visible={!!pendingCall}
          transparent
          animationType="slide"
          onRequestClose={skipCallNotes}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Call Conversation</Text>

              <Text style={styles.modalSubtitle}>
                {pendingCall?.customerName || "Customer"}
                {pendingCall?.mobile ? `  •  ${pendingCall.mobile}` : ""}
              </Text>

              <Text style={styles.modalMeta}>
                Approx. call time: {formatDuration(pendingCall?.durationSeconds)}
              </Text>

              {!!pendingCall?.withRecording && (
                <Text style={styles.modalMeta}>
                  {pendingCall?.recordingUri
                    ? "Call recording saved"
                    : "Recording could not be captured"}
                </Text>
              )}

              {/* CRM status after the call */}
              <Text style={styles.statusPickerLabel}>Call outcome</Text>
              <View style={styles.statusPicker}>
                {CALL_OUTCOME_STATUSES.map((s) => {
                  const selected = callStatus === s.value;
                  const colors = getStatusColors(s.value);
                  return (
                    <Pressable
                      key={s.value}
                      onPress={() => setCallStatus(s.value)}
                      style={[
                        styles.statusChip,
                        selected && {
                          backgroundColor: colors.bg,
                          borderColor: colors.text,
                        },
                      ]}
                    >
                      {selected && (
                        <MaterialIcons name="check" size={14} color={colors.text} />
                      )}
                      <Text
                        style={[
                          styles.statusChipText,
                          selected && { color: colors.text, fontWeight: "800" },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.modalInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="What did the customer say? Add conversation notes..."
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
              />

              <View style={styles.modalButtonRow}>
                <Pressable
                  style={styles.modalSkipButton}
                  onPress={skipCallNotes}
                >
                  <Text style={styles.modalSkipText}>Skip</Text>
                </Pressable>

                <Pressable
                  style={styles.modalSaveButton}
                  onPress={saveCallNotes}
                >
                  <Text style={styles.modalSaveText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // =========================================================
  // LEAD CARD
  // =========================================================
  const renderLead = ({ item }) => {
    const statusColors = getStatusColors(getLeadStatus(item));
    const productCount = item?.products?.length || 0;

    return (
      <Pressable style={styles.card} onPress={() => setSelectedLead(item)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {String(item?.customerName || "?")
              .trim()
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item?.customerName || "Unknown"}
            </Text>

            {/* Exact CRM status, same as the details page */}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColors.bg, maxWidth: "55%" },
              ]}
            >
              <Text
                style={[styles.statusText, { color: statusColors.text }]}
                numberOfLines={1}
              >
                {prettyStatus(
                  item?.isConverted ? "CONVERTED" : item?.crmStatus || "NEW"
                )}
              </Text>
            </View>
          </View>

          <Text style={styles.cardMobile}>{item?.mobile || "-"}</Text>

          <View style={styles.cardMetaRow}>
            <MaterialIcons name="inventory-2" size={14} color="#777" />

            <Text style={styles.cardMeta}>
              {productCount} {productCount === 1 ? "product" : "products"}
            </Text>

            <Text style={styles.cardDot}>•</Text>

            <Text style={styles.cardMeta}>
              {formatDate(item?.submittedAt || item?.createdAt)}
            </Text>
          </View>

          {!!item?.salesmanName && (
            <Text style={styles.cardSalesman} numberOfLines={1}>
              By {item.salesmanName}
            </Text>
          )}
        </View>

        {/* QUICK CALL */}
        <Pressable
          style={styles.callIconButton}
          onPress={() => {
            // Same flow as the details page, so the call is logged and the
            // lead is marked as called on the server
            setSelectedLead(item);
            handleCallPress(item);
          }}
          hitSlop={8}
        >
          <MaterialIcons name="call" size={20} color="#fff" />
        </Pressable>
      </Pressable>
    );
  };

  // =========================================================
  // LOADING
  // =========================================================
  if (loading && !refreshing && leads.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#EA580C" />

        <Text style={styles.centerText}>Loading leads...</Text>
      </View>
    );
  }

  // =========================================================
  // LIST VIEW (default)
  // =========================================================
  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Leads</Text>

            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {user?.employeeLocationSAP || user?.location || "Your store"}
              {user?.siteCode || user?.siteId
                ? `  •  ${user?.siteCode ?? user?.siteId}`
                : ""}
            </Text>
          </View>

          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeNumber}>{leads.length}</Text>

            <Text style={styles.totalBadgeLabel}>Total</Text>
          </View>
        </View>
      </View>

      {/* SEARCH */}
      <View style={styles.searchWrapper}>
        <MaterialIcons name="search" size={21} color="#777" />

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, mobile or product"
          placeholderTextColor="#999"
        />

        {!!search && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <MaterialIcons name="close" size={19} color="#777" />
          </Pressable>
        )}
      </View>

      {/* ERROR */}
      {!!errorMessage && (
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={20} color="#DC2626" />

          <Text style={styles.errorText}>{errorMessage}</Text>

          <Pressable onPress={() => loadLeads(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* LIST */}
      <FlatList
        data={visibleLeads}
        keyExtractor={(item, index) =>
          String(item?._id || item?.id || item?.leadId || index)
        }
        renderItem={renderLead}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadLeads(true)}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
        ListFooterComponent={
          hasMoreLeads ? (
            <View style={styles.showMoreWrapper}>
              <Text style={styles.showMoreCount}>
                Showing {visibleLeads.length} of {filteredLeads.length} leads
              </Text>

              <Pressable
                style={styles.showMoreButton}
                onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                <Text style={styles.showMoreText}>Show More</Text>

                <MaterialIcons name="expand-more" size={20} color="#0F2D52" />
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !errorMessage ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="people-outline" size={56} color="#C7CCD6" />

              <Text style={styles.emptyTitle}>
                {search ? "No matching leads" : "No leads yet"}
              </Text>

              <Text style={styles.emptySubtitle}>
                {search
                  ? "Try a different name or number."
                  : "Leads created from this store will appear here."}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ===========================================================
// STYLES
// ===========================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3EEE8",
  },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3EEE8",
    padding: 20,
  },

  centerText: {
    marginTop: 12,
    fontSize: 16,
    color: "#555",
  },

  // ---------------- LIST HEADER ----------------
  header: {
    height: 160,
    paddingTop: 50,
    paddingHorizontal: 18,
    justifyContent: "center",
    backgroundColor: "#0F2D52",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },

  headerSubtitle: {
    marginTop: 4,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#D5DCE5",
  },

  totalBadge: {
    alignItems: "center",
    backgroundColor: "#FDEBDD",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 12,
  },

  totalBadgeNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EA580C",
  },

  totalBadgeLabel: {
    fontSize: 10,
    color: "#555",
  },

  // ---------------- SEARCH ----------------
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5DED5",
    borderRadius: 12,
  },

  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#111827",
  },

  // ---------------- ERROR ----------------
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
  },

  errorText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: "#991B1B",
  },

  retryText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#EA580C",
  },

  // ---------------- LIST ----------------
  listContent: {
    padding: 16,
    paddingBottom: 30,
    flexGrow: 1,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FDEBDD",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: 19,
    fontWeight: "700",
    color: "#EA580C",
  },

  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginRight: 8,
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },

  cardMobile: {
    marginTop: 3,
    fontSize: 14,
    color: "#374151",
  },

  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  cardMeta: {
    marginLeft: 4,
    fontSize: 12,
    color: "#777",
  },

  cardDot: {
    marginHorizontal: 6,
    color: "#BBB",
  },

  cardSalesman: {
    marginTop: 3,
    fontSize: 12,
    color: "#9CA3AF",
  },

  callIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  // ---------------- SHOW MORE ----------------
  showMoreWrapper: {
    alignItems: "center",
    marginTop: 4,
  },

  showMoreCount: {
    fontSize: 12,
    color: "#777",
    marginBottom: 4,
  },

  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    paddingLeft: 20,
    paddingRight: 14,
    paddingVertical: 9,
    backgroundColor: "#E1E7F0",
    borderRadius: 20,
  },

  showMoreText: {
    marginRight: 2,
    color: "#0F2D52",
    fontSize: 14,
    fontWeight: "700",
  },

  // ---------------- EMPTY ----------------
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "700",
    color: "#374151",
  },

  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 30,
  },

  // ---------------- DETAILS VIEW ----------------
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 26,
    backgroundColor: "#0F2D52",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  headerBackButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  detailHeaderTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },

  detailContent: {
    padding: 14,
    paddingBottom: 110,
  },

  heroCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EEF0F4",
  },

  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FDEBDD",
    justifyContent: "center",
    alignItems: "center",
  },

  heroAvatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#EA580C",
  },

  heroName: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
  },

  heroMobile: {
    marginTop: 2,
    fontSize: 14,
    color: "#4B5563",
  },

  heroStatusBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },

  // "Change Status" dropdown under the status pill
  heroStatusDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 28,
    minWidth: 120,
    justifyContent: "center",
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    backgroundColor: "#fff",
  },

  statusSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },

  statusSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },

  statusSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 8,
    paddingHorizontal: 8,
  },

  statusSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  statusSheetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  statusSheetText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  heroStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  callButtonText: {
    marginLeft: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EEF0F4",
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
  },

  countBadge: {
    backgroundColor: "#FDEBDD",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },

  countBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EA580C",
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },

  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FDEBDD",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  detailLabel: {
    fontSize: 11,
    color: "#777",
  },

  detailValue: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },

  productItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  tickCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  productNumber: {
    fontSize: 11,
    color: "#777",
  },

  productCode: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },

  noDataText: {
    fontSize: 14,
    color: "#9CA3AF",
  },

  remarksText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },

  bottomCallButton: {
    height: 52,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  // ---------------- CALL HISTORY ----------------
  crmStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
  },

  crmStatusPillText: {
    fontSize: 12,
    fontWeight: "800",
  },

  crmHistoryItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },

  crmHistoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EA580C",
    marginTop: 5,
    marginRight: 10,
  },

  crmHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },

  crmHistoryStatus: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1F2937",
  },

  crmHistoryDate: {
    fontSize: 11,
    color: "#777",
  },

  crmHistoryComment: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },

  crmHistoryAgent: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },

  callLogItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  callLogIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },

  callLogTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },

  callLogMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#777",
  },

  callLogNotes: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },

  playButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EA580C",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  playButtonText: {
    marginLeft: 4,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  noRecordingText: {
    marginTop: 6,
    fontSize: 12,
    color: "#9CA3AF",
  },

  // ---------------- CALL CONVERSATION POPUP ----------------
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },

  modalSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#4B5563",
  },

  modalMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#9CA3AF",
  },

  statusPickerLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },

  statusPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },

  statusChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },

  modalInput: {
    marginTop: 14,
    minHeight: 110,
    maxHeight: 180,
    backgroundColor: "#F7F4F0",
    borderWidth: 1,
    borderColor: "#E5DED5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },

  modalButtonRow: {
    flexDirection: "row",
    marginTop: 16,
  },

  modalSkipButton: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#D9DEE7",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  modalSkipText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6B7280",
  },

  modalSaveButton: {
    flex: 2,
    height: 48,
    backgroundColor: "#EA580C",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  modalSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});