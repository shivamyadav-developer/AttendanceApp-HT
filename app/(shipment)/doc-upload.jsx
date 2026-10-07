import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const DOC_TYPES = [
  { key: "invoice", label: "Invoice", icon: "receipt-long" },
  { key: "delivery_challan", label: "Delivery Challan", icon: "assignment" },
  { key: "other", label: "Other", icon: "description" },
];

export default function DocUpload() {
  const router = useRouter();

  const [selectedType, setSelectedType] = useState("invoice");
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets ? result.assets[0] : result;

      setUploading(true);

      // Later we will call:
      // uploadService.uploadDocument(file, selectedType)

      setTimeout(() => {
        setDocuments((prev) => [
          {
            id: Date.now().toString(),
            name: file.name || "Document",
            size: file.size,
            type: selectedType,
          },
          ...prev,
        ]);
        setUploading(false);
      }, 600);
    } catch (error) {
      setUploading(false);
      Alert.alert("Error", "Could not open document picker. Please try again.");
    }
  };

  const removeDocument = (id) => {
    Alert.alert(
      "Remove document",
      "Are you sure you want to remove this document?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            setDocuments((prev) => prev.filter((d) => d.id !== id)),
        },
      ]
    );
  };

  const typeMeta = (key) =>
    DOC_TYPES.find((t) => t.key === key) || DOC_TYPES[2];

  const saveAndNext = () => {
    if (documents.length === 0) {
      Alert.alert("No documents", "Please upload at least one document.");
      return;
    }

    setSubmitting(true);

    // Later we will call:
    // uploadService.submitDocuments(documents)

    setTimeout(() => {
      setSubmitting(false);
      router.push("/(shipment)/vehicle-pic");
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
          <MaterialIcons name="upload-file" size={26} color="#D96A17" />
        </View>

        <View>
          <Text style={styles.title}>Document Upload</Text>
          <Text style={styles.subtitle}>
            Upload trip related documents
          </Text>
        </View>
      </View>

      {/* Upload Card */}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DOCUMENT TYPE</Text>

        <View style={styles.typeRow}>
          {DOC_TYPES.map((type) => {
            const active = selectedType === type.key;
            return (
              <TouchableOpacity
                key={type.key}
                activeOpacity={0.75}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setSelectedType(type.key)}
              >
                <MaterialIcons
                  name={type.icon}
                  size={16}
                  color={active ? "#fff" : "#D96A17"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.typeChipText,
                    active && styles.typeChipTextActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.dropzone}
          activeOpacity={0.7}
          onPress={pickDocument}
          disabled={uploading}
        >
          <View style={styles.dropzoneIconBox}>
            <MaterialIcons
              name={uploading ? "hourglass-top" : "cloud-upload"}
              size={26}
              color="#D96A17"
            />
          </View>

          <Text style={styles.dropzoneTitle}>
            {uploading ? "Uploading..." : "Select Document"}
          </Text>

          <Text style={styles.dropzoneHint}>
            PDF or image, up to 10 MB
          </Text>
        </TouchableOpacity>
      </View>

      {/* Uploaded Documents */}

      <View style={styles.listHeader}>
        <Text style={styles.sectionLabelDark}>
          Uploaded Documents
        </Text>
        {documents.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{documents.length}</Text>
          </View>
        )}
      </View>

      {documents.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="folder-open" size={28} color="#C9C2B8" />
          <Text style={styles.emptyStateText}>
            No documents uploaded yet
          </Text>
        </View>
      ) : (
        documents.map((doc) => (
          <View key={doc.id} style={styles.docRow}>
            <View style={styles.docIconBox}>
              <MaterialIcons
                name={typeMeta(doc.type).icon}
                size={20}
                color="#D96A17"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.docName} numberOfLines={1}>
                {doc.name}
              </Text>
              <Text style={styles.docMeta}>
                {typeMeta(doc.type).label}
                {doc.size ? `  ·  ${formatSize(doc.size)}` : ""}
              </Text>
            </View>

            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => removeDocument(doc.id)}
            >
              <MaterialIcons name="close" size={20} color="#B8B0A6" />
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Save & Next */}

      <TouchableOpacity
        style={[
          styles.submitButton,
          (documents.length === 0 || submitting) && styles.submitButtonDisabled,
        ]}
        activeOpacity={0.85}
        onPress={saveAndNext}
        disabled={documents.length === 0 || submitting}
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
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
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

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 26,
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

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B8B0A6",
    letterSpacing: 1,
    marginBottom: 12,
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },

  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: "#FFF0E6",
    borderWidth: 1,
    borderColor: "#FFE2CC",
  },

  typeChipActive: {
    backgroundColor: "#D96A17",
    borderColor: "#D96A17",
  },

  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B0550F",
  },

  typeChipTextActive: {
    color: "#fff",
  },

  dropzone: {
    borderWidth: 1.5,
    borderColor: "#EDEAE6",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 26,
    alignItems: "center",
    backgroundColor: "#FAFAF9",
  },

  dropzoneIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  dropzoneTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#3A2415",
  },

  dropzoneHint: {
    fontSize: 12.5,
    color: "#A8A29E",
    marginTop: 4,
  },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionLabelDark: {
    fontSize: 15,
    fontWeight: "800",
    color: "#3A2415",
  },

  countBadge: {
    marginLeft: 8,
    backgroundColor: "#FFF0E6",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D96A17",
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFEBE6",
  },

  emptyStateText: {
    marginTop: 8,
    fontSize: 13.5,
    color: "#A8A29E",
  },

  docRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F0EDE9",
  },

  docIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  docName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#3A2415",
  },

  docMeta: {
    fontSize: 12.5,
    color: "#A8A29E",
    marginTop: 2,
  },

  submitButton: {
    height: 56,
    backgroundColor: "#D96A17",
    borderRadius: 15,
    marginTop: 22,
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