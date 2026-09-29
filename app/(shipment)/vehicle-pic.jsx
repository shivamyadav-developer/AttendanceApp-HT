import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

export default function VehiclePic() {
  const takePhoto = () => {
    Alert.alert(
      "Vehicle Photo",
      "Camera will open here."
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vehicle Photo</Text>

      <Text style={styles.subtitle}>
        Take a photo of the vehicle
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={takePhoto}
      >
        <Text style={styles.buttonText}>
          📸 Take Vehicle Photo
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F7F7F7",
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#3A2415",
  },

  subtitle: {
    marginTop: 8,
    color: "#777",
  },

  button: {
    marginTop: 30,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#D96A17",
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});