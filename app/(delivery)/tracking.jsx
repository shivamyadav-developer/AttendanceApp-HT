import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import Marker from "@/components/StaticMarker";
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


const ROLE = "delivery";
const UPDATE_INTERVAL_MS = 60 * 1000; // 1 min
const DESTINATION = { latitude: 19.119800, longitude: 72.911100 };  // customer address

const ORDER_STATUSES = [
  { key: "placed", label: "Order Placed" },
  { key: "picked_up", label: "Picked Up" },
  { key: "on_the_way", label: "On the Way" },
  { key: "arriving", label: "Arriving Soon" },
  { key: "delivered", label: "Delivered" },
];

export default function Tracking() {
  const mapRef = useRef(null);
  const lastSavedAtRef = useRef(0);
  const initialDistanceRef = useRef(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [trail, setTrail] = useState([]);
  const [distance, setDistance] = useState(null);

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
    if (now - lastSavedAtRef.current < UPDATE_INTERVAL_MS) return;
    lastSavedAtRef.current = now;

    const coords = { latitude: loc.latitude, longitude: loc.longitude };
    const { payload, trail: nextTrail } = await saveLocation(ROLE, coords);
    const response = await TrackingBackendService.updateLocation({
      employeeId: "DELIVERY001",
      orderId: "ORD500",
      latitude: payload.latitude,
      longitude: payload.longitude,
    });

    console.log("Tracking Response:", response);
    setCurrentLocation(payload);
    const route = await getRoute(payload, DESTINATION);

    setRouteCoordinates(route.coordinates);
    setTrail(nextTrail);

    const d = distanceMeters(payload, DESTINATION);
    setDistance(d);
    if (initialDistanceRef.current == null) initialDistanceRef.current = d;
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

  const currentStatus =
    distance == null
      ? "placed"
      : distance < 50
        ? "delivered"
        : distance < 300
          ? "arriving"
          : progress > 0.3
            ? "on_the_way"
            : progress > 0.05
              ? "picked_up"
              : "placed";

  const statusIndex = ORDER_STATUSES.findIndex((s) => s.key === currentStatus);
  const eta = distance != null ? calculateEta(distance) : null;

  return (
    <View style={styles.container}>
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
            <View style={styles.riderMarker}>
              <Text style={{ fontSize: 18 }}>🛵</Text>
            </View>
          </Marker>
        )}

        <Marker coordinate={DESTINATION} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.destMarker}>
            <Text style={{ fontSize: 16 }}>📍</Text>
          </View>
        </Marker>
      </MapView>

      <View style={styles.etaCard}>
        <Text style={styles.etaMinutes}>{currentStatus === "delivered" ? "🎉" : eta ?? "--"}</Text>
        {currentStatus !== "delivered" && <Text style={styles.etaLabel}>mins away</Text>}
        <Text style={styles.etaSubtitle}>
          {currentStatus === "delivered" ? "Order Delivered!" : "Your order is on the way"}
        </Text>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.riderName}>Rahul is delivering your order</Text>

        <View style={styles.timeline}>
          {ORDER_STATUSES.map((s, idx) => {
            const isDone = idx <= statusIndex;
            const isLast = idx === ORDER_STATUSES.length - 1;
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  riderMarker: { backgroundColor: "#fff", padding: 6, borderRadius: 20, borderWidth: 2, borderColor: "#FF5A1F", elevation: 4 },
  destMarker: { backgroundColor: "#fff", padding: 4, borderRadius: 16, borderWidth: 2, borderColor: "#2ECC71" },
  etaCard: { position: "absolute", top: 50, alignSelf: "center", backgroundColor: "#fff", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 18, alignItems: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  etaMinutes: { fontSize: 26, fontWeight: "800", color: "#FF5A1F" },
  etaLabel: { fontSize: 12, color: "#888", marginTop: -2 },
  etaSubtitle: { fontSize: 13, fontWeight: "600", color: "#333", marginTop: 4 },
  bottomSheet: { position: "absolute", bottom: 0, width: "100%", backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 30, elevation: 10, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: -4 } },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginBottom: 14 },
  riderName: { fontSize: 16, fontWeight: "700", color: "#222", marginBottom: 16 },
  timeline: { marginTop: 4 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start" },
  timelineIconCol: { alignItems: "center", width: 24 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#e0e0e0" },
  dotActive: { backgroundColor: "#FF5A1F" },
  line: { width: 2, height: 28, backgroundColor: "#e0e0e0" },
  lineActive: { backgroundColor: "#FF5A1F" },
  timelineLabel: { fontSize: 14, color: "#aaa", marginLeft: 12, marginTop: -2, paddingBottom: 14 },
  timelineLabelActive: { color: "#222", fontWeight: "600" },
});