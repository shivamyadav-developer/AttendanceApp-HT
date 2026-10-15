import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

import TrackingBackendService from "@/services/trackingBackend.service";

const NAVY = "#0B2540";
const GREEN = "#0F7A5C";
const ORANGE = "#EA7A1E";
const ROLE = "fitter";
const UPDATE_INTERVAL_MS = 60 * 1000; // 1 min
const DESTINATION = { latitude: 19.119800, longitude: 72.911100 }; // customer address

const JOB_STATUSES = [
  { key: "assigned", label: "Job Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived at Location" },
  { key: "in_progress", label: "Job In Progress" },
  { key: "completed", label: "Job Completed" },
];

// TODO: replace with real assigned job from API
const ACTIVE_JOB = {
  id: "1",
  title: "Wardrobe Installation",
  customer: "Rohan Mehta",
  address: "Powai, Mumbai",
  time: "11:00 AM",
  priority: "High",
};

export default function Tracking() {
  const mapRef = useRef(null);
  const lastSavedAtRef = useRef(0);
  const initialDistanceRef = useRef(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [trail, setTrail] = useState([]);
  const [distance, setDistance] = useState(null);

  // hydrate from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      const [loc, savedTrail] = await Promise.all([
        getLastLocation(ROLE),
        getTrail(ROLE),
      ]);
      if (loc) {
        setCurrentLocation(loc);

        // Fetch road route
        const route = await getRoute(loc, DESTINATION);
        setRouteCoordinates(route.coordinates);

        const d = distanceMeters(loc, DESTINATION);
        setDistance(d);
        initialDistanceRef.current = d;
      }
      if (savedTrail) setTrail(savedTrail);
    })();
  }, []);

  const handleFix = useCallback(async (loc) => {
    const now = Date.now();
    if (now - lastSavedAtRef.current < UPDATE_INTERVAL_MS) return; // throttle to 1/min
    lastSavedAtRef.current = now;

    const coords = {
      latitude: loc.latitude,
      longitude: loc.longitude,
    };

    const { payload, trail: nextTrail } = await saveLocation(ROLE, coords);

    // Send location to MongoDB
    try {
      const response = await TrackingBackendService.updateLocation({
        employeeId: "FITTER001", // Hardcoded for now
        orderId: "ORD500",    // Hardcoded for now
        latitude: payload.latitude,
        longitude: payload.longitude,
      });

      console.log("MongoDB Response:", response);
    } catch (error) {
      console.error("Tracking API Error:", error);
    }

    setCurrentLocation(payload);

    const route = await getRoute(payload, DESTINATION);
    setRouteCoordinates(route.coordinates);

    setTrail(nextTrail);

    const d = distanceMeters(payload, DESTINATION);
    setDistance(d);

    if (initialDistanceRef.current == null) {
      initialDistanceRef.current = d;
    }
  }, []);

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

  const progress =
    initialDistanceRef.current && distance != null
      ? 1 - distance / initialDistanceRef.current
      : 0;

  const currentStatusKey =
    distance == null
      ? "assigned"
      : distance < 50
        ? "completed"
        : distance < 300
          ? "arrived"
          : progress > 0.05
            ? "en_route"
            : "assigned";

  const statusIndex = JOB_STATUSES.findIndex((s) => s.key === currentStatusKey);
  const eta = distance != null ? calculateEta(distance) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>LIVE TRACKING</Text>
        <Text style={styles.title}>{ACTIVE_JOB.title}</Text>
        <Text style={styles.subtitle}>Job for {ACTIVE_JOB.customer}</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: currentLocation?.latitude ?? DESTINATION.latitude,
            longitude: currentLocation?.longitude ?? DESTINATION.longitude,
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

          <Marker coordinate={DESTINATION} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.destMarker}>
              <MaterialIcons name="place" size={18} color="#fff" />
            </View>
          </Marker>
        </MapView>

        <View style={styles.etaCard}>
          <Text style={styles.etaMinutes}>
            {currentStatusKey === "completed" ? "🎉" : eta ?? "--"}
          </Text>
          {currentStatusKey !== "completed" && <Text style={styles.etaLabel}>mins away</Text>}
        </View>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.dragHandle} />

        <View style={styles.jobInfoRow}>
          <MaterialIcons name="place" size={16} color="#6B7280" />
          <Text style={styles.jobInfoText}>{ACTIVE_JOB.address}</Text>
        </View>
        <View style={styles.jobInfoRow}>
          <MaterialIcons name="access-time" size={16} color="#6B7280" />
          <Text style={styles.jobInfoText}>Scheduled: {ACTIVE_JOB.time}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY },
  header: { backgroundColor: NAVY, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  eyebrow: { color: ORANGE, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#9CA9BB", fontSize: 13 },
  mapWrap: { flex: 1 },
  fitterMarker: { backgroundColor: GREEN, padding: 8, borderRadius: 20, borderWidth: 2, borderColor: "#fff", elevation: 4 },
  destMarker: { backgroundColor: ORANGE, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: "#fff" },
  etaCard: { position: "absolute", top: 16, alignSelf: "center", backgroundColor: "#fff", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 16, alignItems: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  etaMinutes: { fontSize: 22, fontWeight: "800", color: GREEN },
  etaLabel: { fontSize: 11, color: "#888", marginTop: -2 },
  bottomSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, elevation: 10, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: -4 } },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginBottom: 14 },
  jobInfoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  jobInfoText: { fontSize: 13.5, color: "#374151", fontWeight: "500" },
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