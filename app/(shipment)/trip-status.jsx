import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

export default function TripStatus() {
  const completeTrip = () => {
    Alert.alert(
      "Trip Completed",
      "Trip marked as completed."
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip Status</Text>

      <View style={styles.card}>
        <Text style={styles.tripTitle}>
          Trip #TRIP001
        </Text>

        <Text style={styles.info}>
          Vehicle: OD-02-AB-1234
        </Text>

        <Text style={styles.info}>
          Destination: Bhubaneswar
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            Status: IN PROGRESS
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={completeTrip}
        >
          <Text style={styles.buttonText}>
            Mark Trip Complete
          </Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
  },

  tripTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  info: {
    marginTop: 10,
    color: "#666",
  },

  statusBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FFF4EC",
  },

  statusText: {
    color: "#D96A17",
    fontWeight: "700",
  },

  button: {
    marginTop: 20,
    height: 48,
    backgroundColor: "#D96A17",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
});