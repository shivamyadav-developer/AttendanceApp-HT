import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

import trackingApi from "../../services/trackingApi";

const TRIP_ID = "TRIP001"; // Replace with the real trip id passed into this screen

const STAGES = [
  { key: "started", label: "Trip Started" },
  { key: "in_progress", label: "In Transit" },
  { key: "completed", label: "Completed" },
];

const STATUS_META = {
  in_progress: {
    label: "IN PROGRESS",
    color: "#D96A17",
    bg: "#FFF4EC",
    icon: "local-shipping",
  },
  completed: {
    label: "COMPLETED",
    color: "#2E9E52",
    bg: "#EAF8EF",
    icon: "check-circle",
  },
};

// Poll the backend for the vehicle's latest position every 5 seconds
const LOCATION_POLL_MS = 5000;

export default function TripStatus() {
  const [tripStarted, setTripStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  const [status, setStatus] = useState("in_progress");
  const [completing, setCompleting] = useState(false);

  const [vehicleLocation, setVehicleLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [locationError, setLocationError] = useState(false);

  const mapRef = useRef(null);
  const pollRef = useRef(null);

  const meta = STATUS_META[status];
  const stageIndex = status === "completed" ? 2 : 1;

  const fetchVehicleLocation = async () => {
    try {
      // Expected response shape: { latitude, longitude, heading, updatedAt }
      // Adjust the endpoint below to match your tracking-backend route.
      const data = await trackingApi.get(`/trips/${TRIP_ID}/location`);

      if (data?.latitude && data?.longitude) {
        const coords = {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
        };

        setVehicleLocation(coords);
        setLastUpdated(new Date());
        setLocationError(false);

        if (mapRef.current) {
          mapRef.current.animateToRegion(
            {
              ...coords,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            500
          );
        }
      }
    } catch (error) {
      setLocationError(true);
    }
  };

  useEffect(() => {
    if (!tripStarted) return;

    fetchVehicleLocation();
    pollRef.current = setInterval(fetchVehicleLocation, LOCATION_POLL_MS);

    return () => clearInterval(pollRef.current);
  }, [tripStarted]);

  const recenterMap = () => {
    if (mapRef.current && vehicleLocation) {
      mapRef.current.animateToRegion(
        {
          ...vehicleLocation,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  };

  const secondsAgo = lastUpdated
    ? Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))
    : null;

  const startTrip = () => {
    setStarting(true);

    // Later we will call:
    // shipmentService.startTrip(tripId)

    setTimeout(() => {
      setStarting(false);
      setTripStarted(true);
      setStatus("in_progress");
    }, 600);
  };

  const completeTrip = () => {
    Alert.alert(
      "Mark trip complete",
      "Are you sure you want to mark this trip as completed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            setCompleting(true);

            // Later we will call:
            // shipmentService.completeTrip(tripId)

            setTimeout(() => {
              setCompleting(false);
              setStatus("completed");
              Alert.alert("Trip Completed", "Trip marked as completed.");
            }, 700);
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}

      <View style={styles.header}>
        <View style={styles.iconBox}>
          <MaterialIcons name="assignment" size={26} color="#D96A17" />
        </View>

        <View>
          <Text style={styles.title}>Trip Status</Text>
          <Text style={styles.subtitle}>Track and update this trip</Text>
        </View>
      </View>

      {/* Live Map Card */}

      <View style={styles.mapCard}>
        <View style={styles.mapHeaderRow}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>

          <Text style={styles.mapHeaderTitle}>Vehicle Location</Text>

          <TouchableOpacity
            style={styles.recenterButton}
            activeOpacity={0.75}
            onPress={recenterMap}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="my-location" size={16} color="#D96A17" />
          </TouchableOpacity>
        </View>

        <View style={styles.mapWrapper}>
          {vehicleLocation ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                ...vehicleLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              onMapReady={() => setMapReady(true)}
            >
              <Marker
                coordinate={vehicleLocation}
                title="Vehicle"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.vehicleMarkerRing}>
                  <View style={styles.vehicleMarker}>
                    <MaterialIcons
                      name="local-shipping"
                      size={15}
                      color="#fff"
                    />
                  </View>
                </View>
              </Marker>
            </MapView>
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPlaceholderIconBox}>
                <MaterialIcons
                  name={
                    !tripStarted
                      ? "play-circle-outline"
                      : locationError
                      ? "location-off"
                      : "location-searching"
                  }
                  size={22}
                  color="#D96A17"
                />
              </View>
              <Text style={styles.mapPlaceholderText}>
                {!tripStarted
                  ? "Start the trip to begin live tracking"
                  : locationError
                  ? "Couldn't fetch vehicle location"
                  : "Locating vehicle..."}
              </Text>
            </View>
          )}

          {tripStarted && !locationError && (
            <View style={styles.mapGradientTag}>
              <MaterialIcons name="place" size={13} color="#D96A17" />
              <Text style={styles.mapGradientTagText}>Bhubaneswar</Text>
            </View>
          )}
        </View>

        {tripStarted && (
          <View style={styles.mapFooterRow}>
            <MaterialIcons
              name={locationError ? "error-outline" : "sync"}
              size={13}
              color={locationError ? "#D64545" : "#A8A29E"}
            />
            <Text
              style={[
                styles.mapFooterText,
                locationError && styles.mapFooterTextError,
              ]}
            >
              {locationError
                ? "Connection issue — retrying"
                : lastUpdated
                ? `Updated ${secondsAgo}s ago`
                : "Waiting for live signal"}
            </Text>
          </View>
        )}
      </View>

      {/* Start Trip */}

      {!tripStarted && (
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.85}
          onPress={startTrip}
          disabled={starting}
        >
          <MaterialIcons
            name={starting ? "hourglass-top" : "play-arrow"}
            size={21}
            color="#fff"
          />
          <Text style={styles.startButtonText}>
            {starting ? "Starting..." : "Start Trip"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Trip Card */}

      {tripStarted && (
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.sectionLabel}>TRIP ID</Text>
              <Text style={styles.tripTitle}>#{TRIP_ID}</Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
              <MaterialIcons name={meta.icon} size={14} color={meta.color} />
              <Text style={[styles.statusBadgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Info rows */}

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MaterialIcons
                name="directions-car"
                size={18}
                color="#D96A17"
              />
            </View>
            <View>
              <Text style={styles.infoLabel}>Vehicle</Text>
              <Text style={styles.infoValue}>OD-02-AB-1234</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MaterialIcons name="place" size={18} color="#D96A17" />
            </View>
            <View>
              <Text style={styles.infoLabel}>Destination</Text>
              <Text style={styles.infoValue}>Bhubaneswar</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Timeline */}

          <Text style={styles.sectionLabel}>PROGRESS</Text>

          <View style={styles.timeline}>
            {STAGES.map((stage, index) => {
              const reached = index <= stageIndex;
              const isLast = index === STAGES.length - 1;

              return (
                <View key={stage.key} style={styles.timelineItem}>
                  <View style={styles.timelineIndicatorCol}>
                    <View
                      style={[
                        styles.timelineDot,
                        reached && styles.timelineDotActive,
                      ]}
                    >
                      {reached && (
                        <MaterialIcons name="check" size={11} color="#fff" />
                      )}
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.timelineLine,
                          index < stageIndex && styles.timelineLineActive,
                        ]}
                      />
                    )}
                  </View>

                  <Text
                    style={[
                      styles.timelineLabel,
                      reached && styles.timelineLabelActive,
                    ]}
                  >
                    {stage.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Action */}

          {status === "completed" ? (
            <View style={styles.completedRow}>
              <MaterialIcons name="check-circle" size={20} color="#2E9E52" />
              <Text style={styles.completedText}>Trip completed</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.85}
              onPress={completeTrip}
              disabled={completing}
            >
              <MaterialIcons
                name={completing ? "hourglass-top" : "check-circle"}
                size={20}
                color="#fff"
              />
              <Text style={styles.buttonText}>
                {completing ? "Updating..." : "Mark Trip Complete"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F7",
  },

  content: {
    padding: 20,
    paddingBottom: 30,
    marginTop: 30,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#3A2415",
    letterSpacing: 0.2,
  },

  subtitle: {
    color: "#8A8A8A",
    marginTop: 3,
    fontSize: 13,
  },

  mapCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F2EFEA",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  mapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF8EF",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    marginRight: 9,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2E9E52",
    marginRight: 5,
  },

  liveBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2E9E52",
    letterSpacing: 0.6,
  },

  mapHeaderTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "800",
    color: "#3A2415",
    letterSpacing: 0.1,
  },

  recenterButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
  },

  mapWrapper: {
    height: 160,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F0EDE9",
  },

  map: {
    width: "100%",
    height: "100%",
  },

  vehicleMarkerRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(217,106,23,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  vehicleMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D96A17",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 4,
      },
    }),
  },

  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  mapPlaceholderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },

  mapPlaceholderText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#A8A29E",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  mapGradientTag: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 20,
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  mapGradientTagText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#3A2415",
  },

  mapFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 7,
    paddingHorizontal: 2,
  },

  mapFooterText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#A8A29E",
  },

  mapFooterTextError: {
    color: "#D64545",
  },

  startButton: {
    height: 54,
    backgroundColor: "#D96A17",
    borderRadius: 15,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#D96A17",
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  startButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F2EFEA",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B8B0A6",
    letterSpacing: 1,
    marginBottom: 6,
  },

  tripTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#3A2415",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 20,
  },

  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  divider: {
    height: 1,
    backgroundColor: "#F0EDE9",
    marginVertical: 12,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  infoLabel: {
    fontSize: 12,
    color: "#A8A29E",
  },

  infoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3A2415",
    marginTop: 1,
  },

  timeline: {
    marginTop: 4,
    marginBottom: 16,
  },

  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  timelineIndicatorCol: {
    alignItems: "center",
    width: 24,
  },

  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EDEAE6",
    alignItems: "center",
    justifyContent: "center",
  },

  timelineDotActive: {
    backgroundColor: "#D96A17",
  },

  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 16,
    backgroundColor: "#EDEAE6",
  },

  timelineLineActive: {
    backgroundColor: "#D96A17",
  },

  timelineLabel: {
    marginLeft: 12,
    marginTop: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#A8A29E",
  },

  timelineLabelActive: {
    color: "#3A2415",
  },

  button: {
    height: 50,
    backgroundColor: "#D96A17",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#D96A17",
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        elevation: 3,
      },
    }),
  },

  buttonText: {
    color: "#fff",
    fontSize: 15.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    backgroundColor: "#EAF8EF",
    borderRadius: 14,
  },

  completedText: {
    color: "#2E9E52",
    fontSize: 15.5,
    fontWeight: "700",
  },
});