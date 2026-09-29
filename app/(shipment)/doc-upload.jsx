import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";

export default function DocUpload() {
  const uploadDocument = () => {
    Alert.alert("Document Upload", "Document picker will open here.");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Document Upload</Text>

      <Text style={styles.subtitle}>
        Upload trip related documents
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={uploadDocument}
      >
        <Text style={styles.buttonText}>
          Select Document
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