import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function NewTrip() {
  const router = useRouter();

  const [mobileNumber, setMobileNumber] = useState("");
  const [transporter, setTransporter] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");

  const [showTransporters, setShowTransporters] = useState(false);

  const transporters = [
    "Transporter 1",
    "Transporter 2",
    "Transporter 3",
  ];

  const saveAndNext = () => {
    if (!mobileNumber) {
      Alert.alert("Required", "Please enter mobile number");
      return;
    }

    if (mobileNumber.length !== 10) {
      Alert.alert(
        "Invalid Mobile",
        "Please enter a valid 10 digit mobile number"
      );
      return;
    }

    if (!transporter) {
      Alert.alert("Required", "Please select transporter");
      return;
    }

    if (!vehicleNumber) {
      Alert.alert("Required", "Please enter vehicle number");
      return;
    }

    if (!fromAddress.trim()) {
      Alert.alert("Required", "Please enter starting address");
      return;
    }

    if (!toAddress.trim()) {
      Alert.alert("Required", "Please enter destination address");
      return;
    }

    const tripData = {
      mobileNumber,
      transporter,
      vehicleNumber,
      fromAddress: fromAddress.trim(),
      toAddress: toAddress.trim(),
    };

    console.log("New Trip:", tripData);

    // Later we will call:
    // shipmentService.createTrip(tripData)

    router.push("/(shipment)/doc-upload");
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}

      <View style={styles.header}>
        <View style={styles.iconBox}>
          <MaterialIcons
            name="local-shipping"
            size={25}
            color="#D96A17"
          />
        </View>

        <View>
          <Text style={styles.title}>New Trip</Text>

          <Text style={styles.subtitle}>
            Create a new shipment trip
          </Text>
        </View>
      </View>

      {/* Mobile Number */}

      <Text style={styles.label}>
        Mobile Number
      </Text>

      <View style={styles.inputContainer}>
        <MaterialIcons
          name="phone"
          size={20}
          color="#D96A17"
        />

        <TextInput
          placeholder="Enter mobile number"
          value={mobileNumber}
          onChangeText={(text) => {
            const value = text.replace(/\D/g, "");

            if (value.length <= 10) {
              setMobileNumber(value);
            }
          }}
          keyboardType="phone-pad"
          maxLength={10}
          style={styles.input}
        />
      </View>

      {/* Transporter */}

      <Text style={styles.label}>
        Transporter
      </Text>

      <TouchableOpacity
        style={styles.inputContainer}
        onPress={() =>
          setShowTransporters(!showTransporters)
        }
      >
        <MaterialIcons
          name="business"
          size={20}
          color="#D96A17"
        />

        <Text
          style={[
            styles.selectText,
            !transporter && styles.placeholder,
          ]}
        >
          {transporter || "Select transporter"}
        </Text>

        <MaterialIcons
          name={
            showTransporters
              ? "keyboard-arrow-up"
              : "keyboard-arrow-down"
          }
          size={24}
          color="#777"
        />
      </TouchableOpacity>

      {/* Transporter List */}

      {showTransporters && (
        <View style={styles.dropdown}>
          {transporters.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.dropdownItem}
              onPress={() => {
                setTransporter(item);
                setShowTransporters(false);
              }}
            >
              <Text style={styles.dropdownText}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Vehicle Number */}

      <Text style={styles.label}>
        Vehicle Number
      </Text>

      <View style={styles.inputContainer}>
        <MaterialIcons
          name="directions-car"
          size={20}
          color="#D96A17"
        />

        <TextInput
          placeholder="Enter vehicle number"
          value={vehicleNumber}
          onChangeText={(text) =>
            setVehicleNumber(
              text.toUpperCase()
            )
          }
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      {/* Route */}

      <View style={styles.routeSection}>
        <View style={styles.routeLine}>
          <View style={styles.routeDotStart} />
          <View style={styles.routeConnector} />
          <View style={styles.routeDotEnd} />
        </View>

        <View style={styles.routeFields}>
          {/* From Address */}

          <Text style={styles.label}>
            From Address
          </Text>

          <View style={styles.textAreaContainer}>
            <MaterialIcons
              name="trip-origin"
              size={20}
              color="#D96A17"
              style={styles.textAreaIcon}
            />

            <TextInput
              placeholder="Enter starting address"
              value={fromAddress}
              onChangeText={setFromAddress}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              style={styles.textArea}
            />
          </View>

          {/* To Address */}

          <Text style={styles.label}>
            To Address
          </Text>

          <View style={styles.textAreaContainer}>
            <MaterialIcons
              name="location-on"
              size={20}
              color="#D96A17"
              style={styles.textAreaIcon}
            />

            <TextInput
              placeholder="Enter destination address"
              value={toAddress}
              onChangeText={setToAddress}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              style={styles.textArea}
            />
          </View>
        </View>
      </View>

      {/* Save & Next */}

      <TouchableOpacity
        style={styles.button}
        onPress={saveAndNext}
      >
        <Text style={styles.buttonText}>
          Save & Next
        </Text>

        <MaterialIcons
          name="arrow-forward"
          size={20}
          color="#fff"
        />
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
    marginBottom: 30,
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
    fontSize: 27,
    fontWeight: "800",
    color: "#3A2415",
  },

  subtitle: {
    color: "#777",
    marginTop: 3,
    fontSize: 13,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3A2415",
    marginBottom: 6,
    marginTop: 10,
  },

  inputContainer: {
    height: 52,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: "#222",
  },

  selectText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: "#222",
  },

  placeholder: {
    color: "#999",
  },

  dropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 12,
    marginTop: 5,
    overflow: "hidden",
  },

  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  dropdownText: {
    fontSize: 15,
    color: "#333",
  },

  routeSection: {
    flexDirection: "row",
    marginTop: 4,
  },

  routeLine: {
    width: 20,
    alignItems: "center",
    paddingTop: 42,
  },

  routeDotStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D96A17",
  },

  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 44,
    backgroundColor: "#EED9C4",
    marginVertical: 4,
  },

  routeDotEnd: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#D96A17",
  },

  routeFields: {
    flex: 1,
    marginLeft: 10,
  },

  textAreaContainer: {
    minHeight: 58,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
  },

  textAreaIcon: {
    marginTop: 2,
    marginRight: 10,
  },

  textArea: {
    flex: 1,
    fontSize: 15,
    color: "#222",
    minHeight: 34,
  },

  button: {
    height: 52,
    backgroundColor: "#D96A17",
    borderRadius: 13,
    marginTop: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});