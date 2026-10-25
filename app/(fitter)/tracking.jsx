import { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import Marker from "@/components/StaticMarker";
import { MaterialIcons } from "@expo/vector-icons";
import eventEmitter from "@/services/eventEmitter";
import { getRoute } from "@/services/route.service";
import {
  saveLocation,
  getLastLocation,
  getTrail,
  distanceMeters,
  calculateEta,
} from "@/services/liveTracking.service";
import fitterService from "@/services/fitter.service";
import TrackingBackendService from "@/services/trackingBackend.service";

const NAVY = "#0B2540";
const GREEN = "#0F7A5C";
const ORANGE = "#EA7A1E";
const ROLE = "fitter";
const UPDATE_INTERVAL_MS = 60 * 1000; // 1 min
const GEOCODE_CACHE_KEY = "fitterJobGeocodes"; // { [ticketId]: { latitude, longitude } }

const JOB_STATUSES = [
  { key: "assigned", label: "Job Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived at Location" },
  { key: "in_progress", label: "Job In Progress" },
  { key: "completed", label: "Job Completed" },
];

// ─── Ticket helpers ──────────────────────────────────────────────────────────

const ticketAddress = (t) =>
  [
    t?.serviceAddress?.line1,
    t?.serviceAddress?.line2,
    t?.serviceAddress?.city,
    t?.serviceAddress?.state,
    t?.serviceAddress?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

const ticketTitle = (t) =>
  t?.productDetails?.productName || t?.type || "Fitting Job";

const ticketSchedule = (t) => {
  const date = t?.fitting?.scheduledDate
    ? new Date(t.fitting.scheduledDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      })
    : null;
  const slot = t?.fitting?.scheduledTimeSlot || null;
  return [date, slot].filter(Boolean).join(", ") || "Not scheduled";
};

// Active job: one already in progress, otherwise the earliest scheduled
const pickActiveJob = (tickets) => {
  if (!tickets.length) return null;
  const inProgress = tickets.find((t) => t?.status === "FITTING_IN_PROGRESS");
  if (inProgress) return inProgress;
  return [...tickets].sort(
    (a, b) =>
      new Date(a?.fitting?.scheduledDate || 8.64e15) -
      new Date(b?.fitting?.scheduledDate || 8.64e15)
  )[0];
};

// Address → coordinates using the phone's built-in geocoder (no API key).
// Cached per ticket so it only runs once.
const geocodeTicket = async (ticket) => {
  const id = String(ticket?._id || "");
  const address = ticketAddress(ticket);
  if (!id || !address) return null;

  try {
    const raw = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    if (cache[id]) return cache[id];

    // Try the full address first, then city + pincode as a fallback
    const attempts = [
      `${address}, India`,
      [ticket?.serviceAddress?.city, ticket?.serviceAddress?.pincode, "India"]
        .filter(Boolean)
        .join(", "),
    ];

    for (const query of attempts) {
      const results = await Location.geocodeAsync(query);
      if (results?.length) {
        const point = {
          latitude: results[0].latitude,
          longitude: results[0].longitude,
        };
        cache[id] = point;
        await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
        return point;
      }
    }
  } catch (e) {
    console.warn("[Tracking] Geocode failed:", e?.message || e);
  }
  return null;
};

export default function Tracking() {
  const mapRef = useRef(null);
  const lastSavedAtRef = useRef(0);
  const initialDistanceRef = useRef(null);

  // Real job + destination (refs so the GPS handler always sees the latest)
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [destination, setDestination] = useState(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const activeJobRef = useRef(null);
  const destinationRef = useRef(null);
  const employeeNumberRef = useRef("");

  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [trail, setTrail] = useState([]);
  const [distance, setDistance] = useState(null);

  activeJobRef.current = activeJob;
  destinationRef.current = destination;

  // Recalculate route + distance from a position to the current destination
  const updateRoute = useCallback(async (from) => {
    const dest = destinationRef.current;
    if (!from || !dest) {
      setRouteCoordinates([]);
      setDistance(null);
      return;
    }
    const route = await getRoute(from, dest);
    setRouteCoordinates(route.coordinates);

    const d = distanceMeters(from, dest);
    setDistance(d);
    if (initialDistanceRef.current == null) initialDistanceRef.current = d;
  }, []);

  // ── Load the fitter's real jobs (every time the tab is opened) ──────────
  const loadJobs = useCallback(async () => {
    try {
      setJobsError("");
      setJobsLoading(true);

      const raw = await AsyncStorage.getItem("userData");
      const user = raw ? JSON.parse(raw) : null;
      employeeNumberRef.current = String(user?.employeeNumber || "");

      const pending = await fitterService.getPendingTasks();
      setJobs(pending);

      // Keep the job the fitter picked if it's still pending
      setActiveJob((prev) =>
        (prev && pending.find((t) => t._id === prev._id)) || pickActiveJob(pending)
      );
    } catch (e) {
      console.warn("[Tracking] Load jobs failed:", e?.message || e);
      setJobsError(e?.message || "Could not load your jobs.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadJobs();
    }, [loadJobs])
  );

  // ── When the active job changes: find its location on the map ───────────
  useEffect(() => {
    let cancelled = false;
    initialDistanceRef.current = null;
    setDestination(null);
    setRouteCoordinates([]);
    setDistance(null);

    if (!activeJob) return undefined;

    (async () => {
      setGeocoding(true);
      const point = await geocodeTicket(activeJob);
      if (cancelled) return;
      setGeocoding(false);
      setDestination(point);
      destinationRef.current = point;

      const loc = await getLastLocation(ROLE);
      if (!cancelled && loc) await updateRoute(loc);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeJob, updateRoute]);

  // ── Restore last position + trail on mount ───────────────────────────────
  useEffect(() => {
    (async () => {
      const [loc, savedTrail] = await Promise.all([
        getLastLocation(ROLE),
        getTrail(ROLE),
      ]);
      if (loc) setCurrentLocation(loc);
      if (savedTrail) setTrail(savedTrail);
    })();
  }, []);

  // ── Live GPS (throttled to 1/min) ────────────────────────────────────────
  const handleFix = useCallback(
    async (loc) => {
      if (loc?.isMocked) return; // never share a fake position

      const now = Date.now();
      if (now - lastSavedAtRef.current < UPDATE_INTERVAL_MS) return;
      lastSavedAtRef.current = now;

      const coords = { latitude: loc.latitude, longitude: loc.longitude };
      const { payload, trail: nextTrail } = await saveLocation(ROLE, coords);

      // Share live location for the real job (customer tracking)
      const job = activeJobRef.current;
      const employeeId = employeeNumberRef.current;
      if (job && employeeId) {
        try {
          await TrackingBackendService.updateLocation({
            employeeId,
            orderId: job.ticketNumber || String(job._id),
            latitude: payload.latitude,
            longitude: payload.longitude,
          });
        } catch (error) {
          console.warn("[Tracking] Backend update failed:", error?.message || error);
        }
      }

      setCurrentLocation(payload);
      setTrail(nextTrail);
      await updateRoute(payload);
    },
    [updateRoute]
  );

  useEffect(() => {
    eventEmitter.on("LOCATION_UPDATED", handleFix);
    return () => eventEmitter.off("LOCATION_UPDATED", handleFix);
  }, [handleFix]);

  useEffect(() => {
    if (!currentLocation) return;
    mapRef.current?.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      650
    );
  }, [currentLocation]);

  // ── Status timeline ──────────────────────────────────────────────────────
  const progress =
    initialDistanceRef.current && distance != null
      ? 1 - distance / initialDistanceRef.current
      : 0;

  const currentStatusKey =
    activeJob?.status === "FITTING_IN_PROGRESS"
      ? "in_progress"
      : distance == null
        ? "assigned"
        : distance < 300
          ? "arrived"
          : progress > 0.05
            ? "en_route"
            : "assigned";

  const statusIndex = JOB_STATUSES.findIndex((s) => s.key === currentStatusKey);
  const eta = distance != null ? calculateEta(distance) : null;

  const mapCenter = currentLocation || destination;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>LIVE TRACKING</Text>
        {jobsLoading && !activeJob ? (
          <Text style={styles.title}>Loading your job…</Text>
        ) : activeJob ? (
          <>
            <Text style={styles.title} numberOfLines={2}>
              {ticketTitle(activeJob)}
            </Text>
            <Text style={styles.subtitle}>
              Job for {activeJob.customer || "Customer"}
              {activeJob.ticketNumber ? `  •  ${activeJob.ticketNumber}` : ""}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>No active job</Text>
            <Text style={styles.subtitle}>
              {jobsError || "You have no pending fittings right now."}
            </Text>
          </>
        )}
      </View>

      {/* Switch between pending jobs */}
      {jobs.length > 1 && (
        <View style={styles.jobChipsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {jobs.map((t) => {
              const selected = activeJob?._id === t._id;
              return (
                <TouchableOpacity
                  key={t._id}
                  style={[styles.jobChip, selected && styles.jobChipActive]}
                  onPress={() => setActiveJob(t)}
                >
                  <Text
                    style={[styles.jobChipText, selected && styles.jobChipTextActive]}
                    numberOfLines={1}
                  >
                    {t.customer || t.ticketNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.mapWrap}>
        {mapCenter ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#4285F4"
                strokeWidth={5}
              />
            )}

            {currentLocation && (
              <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.fitterMarker}>
                  <MaterialIcons name="handyman" size={18} color="#fff" />
                </View>
              </Marker>
            )}

            {destination && (
              <Marker coordinate={destination} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.destMarker}>
                  <MaterialIcons name="place" size={18} color="#fff" />
                </View>
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.mapPlaceholderText}>Getting your location…</Text>
          </View>
        )}

        {activeJob && (
          <View style={styles.etaCard}>
            {geocoding ? (
              <ActivityIndicator color={GREEN} />
            ) : destination ? (
              <>
                <Text style={styles.etaMinutes}>{eta ?? "--"}</Text>
                <Text style={styles.etaLabel}>mins away</Text>
              </>
            ) : (
              <Text style={styles.etaLabel}>Customer location not found</Text>
            )}
          </View>
        )}
      </View>

      {activeJob && (
        <View style={styles.bottomSheet}>
          <View style={styles.dragHandle} />

          <View style={styles.jobInfoRow}>
            <MaterialIcons name="place" size={16} color="#6B7280" />
            <Text style={styles.jobInfoText} numberOfLines={2}>
              {ticketAddress(activeJob) || "Address not available"}
            </Text>
          </View>
          <View style={styles.jobInfoRow}>
            <MaterialIcons name="access-time" size={16} color="#6B7280" />
            <Text style={styles.jobInfoText}>Scheduled: {ticketSchedule(activeJob)}</Text>
          </View>

          <View style={styles.timeline}>
            {JOB_STATUSES.map((s, idx) => {
              const isDone = idx <= statusIndex;
              const isLast = idx === JOB_STATUSES.length - 1;
              return (
                <View key={s.key} style={styles.timelineRow}>
                  <View style={styles.timelineIconCol}>
                    <View style={[styles.dot, isDone && styles.dotActive]} />
                    {!isLast && <View style={[styles.line, isDone && styles.lineActive]} />}
                  </View>
                  <Text style={[styles.timelineLabel, isDone && styles.timelineLabelActive]}>
                    {s.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY },
  header: { backgroundColor: NAVY, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  eyebrow: { color: ORANGE, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#9CA9BB", fontSize: 13 },
  jobChipsBar: { backgroundColor: NAVY, paddingHorizontal: 14, paddingBottom: 12 },
  jobChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginRight: 8,
    maxWidth: 180,
  },
  jobChipActive: { backgroundColor: ORANGE },
  jobChipText: { color: "#D5DCE5", fontSize: 12.5, fontWeight: "600" },
  jobChipTextActive: { color: "#fff", fontWeight: "800" },
  mapWrap: { flex: 1 },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1F3A5C" },
  mapPlaceholderText: { color: "#D5DCE5", marginTop: 8, fontSize: 13 },
  fitterMarker: { backgroundColor: GREEN, padding: 8, borderRadius: 20, borderWidth: 2, borderColor: "#fff", elevation: 4 },
  destMarker: { backgroundColor: ORANGE, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: "#fff" },
  etaCard: { position: "absolute", top: 16, alignSelf: "center", backgroundColor: "#fff", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 16, alignItems: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  etaMinutes: { fontSize: 22, fontWeight: "800", color: GREEN },
  etaLabel: { fontSize: 11, color: "#888", marginTop: -2 },
  bottomSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, elevation: 10, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: -4 } },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginBottom: 14 },
  jobInfoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  jobInfoText: { flex: 1, fontSize: 13.5, color: "#374151", fontWeight: "500" },
  timeline: { marginTop: 10 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start" },
  timelineIconCol: { alignItems: "center", width: 24 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#e0e0e0" },
  dotActive: { backgroundColor: GREEN },
  line: { width: 2, height: 26, backgroundColor: "#e0e0e0" },
  lineActive: { backgroundColor: GREEN },
  timelineLabel: { fontSize: 13.5, color: "#aaa", marginLeft: 12, marginTop: -2, paddingBottom: 12 },
  timelineLabelActive: { color: "#222", fontWeight: "600" },
});
