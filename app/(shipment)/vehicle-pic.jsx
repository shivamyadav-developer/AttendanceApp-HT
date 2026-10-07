import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ANGLES = [
  { key: "front", label: "Front", icon: "airline-seat-recline-normal" },
  { key: "back", label: "Back", icon: "directions-bus" },
  { key: "left", label: "Left Side", icon: "chevron-left" },
  { key: "right", label: "Right Side", icon: "chevron-right" },
  { key: "number_plate", label: "Number Plate", icon: "pin" },
];

export default function VehiclePic() {
  const router = useRouter();

  const [photos, setPhotos] = useState({});
  const [capturingKey, setCapturingKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const takenCount = Object.keys(photos).length;
  const allTaken = takenCount === ANGLES.length;

  const takePhoto = async (angleKey) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Please allow camera access to take vehicle photos."
        );
        return;
      }

      setCapturingKey(angleKey);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });

      setCapturingKey(null);

      if (result.canceled) return;

      const asset = result.assets ? result.assets[0] : result;

      setPhotos((prev) => ({
        ...prev,
        [angleKey]: asset.uri,
      }));

      // Later we will call:
      // uploadService.uploadVehiclePhoto(angleKey, asset)
    } catch (error) {
      setCapturingKey(null);
      Alert.alert("Error", "Could not open camera. Please try again.");
    }
  };

  const retakePhoto = (angleKey) => {
    Alert.alert("Retake photo", "Take this photo again?", [
      { text: "Cancel", style: "cancel" },
      { text: "Retake", onPress: () => takePhoto(angleKey) },
    ]);
  };

  const removePhoto = (angleKey) => {
    Alert.alert("Remove photo", "Remove this vehicle photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setPhotos((prev) => {
            const next = { ...prev };
            delete next[angleKey];
            return next;
          }),
      },
    ]);
  };

  const submitPhotos = () => {
    if (!allTaken) {
      Alert.alert(
        "Photos missing",
        "Please capture all vehicle angles before submitting."
      );
      return;
    }

    setSubmitting(true);

    // Later we will call:
    // uploadService.submitVehiclePhotos(photos)

    setTimeout(() => {
      setSubmitting(false);
      router.push("/(shipment)/trip-status");
    }, 700);
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
          <MaterialIcons name="photo-camera" size={26} color="#D96A17" />
        </View>

        <View>
          <Text style={styles.title}>Vehicle Photo</Text>
          <Text style={styles.subtitle}>
            Take a photo of the vehicle
          </Text>
        </View>
      </View>

      {/* Progress */}

      <View style={styles.progressCard}>
        <View style={styles.progressTextRow}>
          <Text style={styles.progressLabel}>
            {takenCount} of {ANGLES.length} photos captured
          </Text>
          <Text style={styles.progressPercent}>
            {Math.round((takenCount / ANGLES.length) * 100)}%
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(takenCount / ANGLES.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Angle Cards */}

      <Text style={styles.sectionLabelDark}>Required Angles</Text>

      <View style={styles.grid}>
        {ANGLES.map((angle) => {
          const uri = photos[angle.key];
          const isCapturing = capturingKey === angle.key;

          return (
            <View key={angle.key} style={styles.tile}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.tileTouchable}
                onPress={() =>
                  uri ? retakePhoto(angle.key) : takePhoto(angle.key)
                }
                disabled={isCapturing}
              >
                {uri ? (
                  <>
                    <Image source={{ uri }} style={styles.tileImage} />
                    <View style={styles.tileOverlay}>
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#3FBE6C"
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.tileRemove}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => removePhoto(angle.key)}
                    >
                      <MaterialIcons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.tilePlaceholder}>
                    <MaterialIcons
                      name={isCapturing ? "hourglass-top" : "add-a-photo"}
                      size={24}
                      color="#D96A17"
                    />
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.tileLabel}>{angle.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Save & Next */}

      <TouchableOpacity
        style={[
          styles.submitButton,
          (!allTaken || submitting) && styles.submitButtonDisabled,
        ]}
        activeOpacity={0.85}
        onPress={submitPhotos}
        disabled={!allTaken || submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? "Saving..." : "Save & Next"}
        </Text>

        {!submitting && (
          <MaterialIcons name="arrow-forward" size={20} color="#fff" />
        )}
      </TouchableOpacity>
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
    paddingBottom: 40,
    marginTop: 50,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
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

  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 2,
      },
    }),
  },

  progressTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  progressLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#3A2415",
  },

  progressPercent: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#D96A17",
  },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F0EDE9",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#D96A17",
  },

  sectionLabelDark: {
    fontSize: 15,
    fontWeight: "800",
    color: "#3A2415",
    marginBottom: 14,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  tile: {
    width: "31%",
    marginBottom: 18,
    alignItems: "center",
  },

  tileTouchable: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
  },

  tileImage: {
    width: "100%",
    height: "100%",
  },

  tileOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 1,
  },

  tileRemove: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  tilePlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#EDEAE6",
    borderStyle: "dashed",
    backgroundColor: "#FAFAF9",
    alignItems: "center",
    justifyContent: "center",
  },

  tileLabel: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#3A2415",
    textAlign: "center",
  },

  submitButton: {
    height: 56,
    backgroundColor: "#D96A17",
    borderRadius: 15,
    marginTop: 12,
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

  submitButtonDisabled: {
    backgroundColor: "#E8C4A3",
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },

  submitButtonText: {
    color: "#fff",
    fontSize: 16.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});