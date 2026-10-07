import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";

import api from "../services/api";

// =========================================================
// ZOOM SWEEP CONFIG
// =========================================================
const ZOOM_MIN = 0;
const ZOOM_MAX = 0.55;
const ZOOM_TICK_MS = 260;
const ZOOM_SWEEP_STEP = 0.055;
const ZOOM_ANIM_MS = 220;
const TAP_ZOOM_BOOST = 0.25;

export default function BarcodeScanner() {
  // =========================================================
  // STEP
  // 1 = Product scanning
  // 2 = Customer details + submit
  // =========================================================
  const [step, setStep] = useState(1);

  // =========================================================
  // CUSTOMER DETAILS (filled in step 2)
  // =========================================================
  const [mobile, setMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [remarks, setRemarks] = useState("");

  // =========================================================
  // LOGGED-IN USER
  // =========================================================
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // =========================================================
  // CAMERA
  // =========================================================
  const [permission, requestPermission] = useCameraPermissions();

  // =========================================================
  // ZOOM
  // =========================================================
  const [zoomTarget, setZoomTarget] = useState(ZOOM_MIN);
  const animatedZoom = useRef(new Animated.Value(ZOOM_MIN)).current;
  const currentZoomRef = useRef(ZOOM_MIN);
  const zoomSweepRef = useRef(null);

  // =========================================================
  // PRODUCTS
  // =========================================================
  const [scannedProducts, setScannedProducts] = useState([]);

  // Prevent multiple camera callbacks for same scan
  const [scanned, setScanned] = useState(false);

  // Short cooldown so back-to-back scans don't double-fire
  const scanCooldownRef = useRef(false);

  // Submit loading
  const [submitting, setSubmitting] = useState(false);

  // =========================================================
  // LOAD LOGGED-IN USER FROM ASYNC STORAGE
  // =========================================================
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setLoadingUser(true);

        const storedUser = await AsyncStorage.getItem("userData");

        if (!storedUser) {
          console.log("No userData found in AsyncStorage.");
          setUser(null);
          return;
        }

        const parsedUser = JSON.parse(storedUser);
        console.log("Logged-in user:", parsedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error("Failed to load userData:", error?.message || error);
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUserData();
  }, []);

  // =========================================================
  // SMOOTH ZOOM HELPER
  // =========================================================
  const animateZoomTo = (next, duration = ZOOM_ANIM_MS) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));

    currentZoomRef.current = clamped;
    setZoomTarget(clamped);

    Animated.timing(animatedZoom, {
      toValue: clamped,
      duration,
      useNativeDriver: false,
    }).start();
  };

  // =========================================================
  // AUTO ZOOM-SWEEP (only while scanning in step 1)
  // =========================================================
  useEffect(() => {
    const cameraActive =
      step === 1 && permission?.granted && !submitting;

    if (zoomSweepRef.current) {
      clearInterval(zoomSweepRef.current);
      zoomSweepRef.current = null;
    }

    if (!cameraActive || scanned) {
      return;
    }

    zoomSweepRef.current = setInterval(() => {
      const previous = currentZoomRef.current;

      let next = previous + ZOOM_SWEEP_STEP;

      if (next >= ZOOM_MAX) {
        next = ZOOM_MIN;
        animateZoomTo(next, 140);
        return;
      }

      animateZoomTo(next, ZOOM_ANIM_MS);
    }, ZOOM_TICK_MS);

    return () => {
      if (zoomSweepRef.current) {
        clearInterval(zoomSweepRef.current);
        zoomSweepRef.current = null;
      }
    };
  }, [step, permission?.granted, submitting, scanned, animatedZoom]);

  // =========================================================
  // TAP-TO-FOCUS / ZOOM ASSIST
  // =========================================================
  const handleTapToAssist = () => {
    if (scanned || submitting) {
      return;
    }

    const previous = currentZoomRef.current;

    let next = previous + TAP_ZOOM_BOOST;

    if (next >= ZOOM_MAX) {
      next = ZOOM_MIN;
    }

    animateZoomTo(next, 160);
  };

  // =========================================================
  // EXTRACT PRODUCT CODE FROM SCANNED VALUE
  // =========================================================
  const extractProductCode = (data) => {
    if (!data) {
      return "";
    }

    const value = String(data).trim();

    if (!value) {
      return "";
    }

    // CASE 1: Full URL  (https://www.hometown.in/600384489)
    try {
      const url = new URL(value);

      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];

        if (/^\d+$/.test(lastPart)) {
          return lastPart;
        }

        const numberMatch = lastPart.match(/\d+$/);

        if (numberMatch) {
          return numberMatch[0];
        }
      }
    } catch (error) {
      // Not a URL. Continue.
    }

    // CASE 2: URL-like string (www.hometown.in/600384489)
    const parts = value.split("/").filter(Boolean);

    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];

      const cleanLastPart = lastPart
        .split("?")[0]
        .split("#")[0]
        .trim();

      if (/^\d+$/.test(cleanLastPart)) {
        return cleanLastPart;
      }

      const numberMatch = cleanLastPart.match(/\d+$/);

      if (numberMatch) {
        return numberMatch[0];
      }
    }

    // CASE 3: Normal barcode
    return value;
  };

  // =========================================================
  // BARCODE / QR CODE SCANNED
  // =========================================================
  const handleBarcodeScanned = ({ data, type }) => {
    if (!data || scanned || submitting || scanCooldownRef.current) {
      return;
    }

    const rawValue = String(data).trim();

    if (!rawValue) {
      return;
    }

    console.log("=================================");
    console.log("Barcode detected");
    console.log("Barcode type:", type);
    console.log("Raw scanned value:", rawValue);
    console.log("Zoom level at scan:", currentZoomRef.current);

    // ONLY ACCEPT PLAIN NUMERIC BARCODES
    if (!/^\d+$/.test(rawValue)) {
      Alert.alert("Invalid Barcode", "Please scan barcode properly.");
      return;
    }

    const code = extractProductCode(rawValue);

    if (!code) {
      Alert.alert("Invalid Product", "Unable to read the product code.");
      return;
    }

    console.log("Extracted product code:", code);
    console.log("=================================");

    // Stop camera callback temporarily + cooldown
    setScanned(true);
    scanCooldownRef.current = true;

    // Stop zoom sweep
    if (zoomSweepRef.current) {
      clearInterval(zoomSweepRef.current);
      zoomSweepRef.current = null;
    }

    // Reset zoom
    animateZoomTo(ZOOM_MIN, 200);

    // Prevent duplicate product
    if (scannedProducts.includes(code)) {
      Alert.alert(
        "Already Added",
        `${code} is already added to this lead.`
      );

      setTimeout(() => {
        scanCooldownRef.current = false;
      }, 400);

      return;
    }

    // Save product code locally
    setScannedProducts((previous) => [...previous, code]);

    Alert.alert("Product Added", `${code} has been added successfully.`);

    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 400);
  };

  // =========================================================
  // SCAN NEXT PRODUCT
  // =========================================================
  const scanAgain = () => {
    setScanned(false);
    scanCooldownRef.current = false;
    animateZoomTo(ZOOM_MIN, 180);
  };

  // =========================================================
  // REMOVE PRODUCT
  // =========================================================
  const removeProduct = (code) => {
    setScannedProducts((previous) =>
      previous.filter((item) => item !== code)
    );

    // If everything is removed while on the details step, go back to scanning
    if (step === 2 && scannedProducts.length <= 1) {
      setStep(1);
    }

    setScanned(false);
    scanCooldownRef.current = false;
    animateZoomTo(ZOOM_MIN, 180);
  };

  // =========================================================
  // STEP 1 -> STEP 2  (products scanned, now customer details)
  // =========================================================
  const handleNext = () => {
    if (scannedProducts.length === 0) {
      Alert.alert("No Products", "Please scan at least one product.");
      return;
    }

    setStep(2);
  };

  // =========================================================
  // STEP 2 -> BACK TO SCANNER
  // =========================================================
  const handleBackToScan = () => {
    setScanned(false);
    scanCooldownRef.current = false;
    animateZoomTo(ZOOM_MIN, 0);
    setStep(1);
  };

  // =========================================================
  // SUBMIT LEAD
  // =========================================================
  const submitLead = async () => {
    const cleanMobile = mobile.trim();
    const cleanName = customerName.trim();

    // ---------- Customer validation ----------
    if (!cleanMobile) {
      Alert.alert("Required", "Please enter customer mobile number.");
      return;
    }

    if (!/^\d{10}$/.test(cleanMobile)) {
      Alert.alert(
        "Invalid Mobile Number",
        "Please enter a valid 10-digit mobile number."
      );
      return;
    }

    if (!cleanName) {
      Alert.alert("Required", "Please enter customer name.");
      return;
    }

    if (scannedProducts.length === 0) {
      Alert.alert("No Products", "Please scan at least one product.");
      return;
    }

    // ---------- Logged-in user ----------
    if (!user) {
      Alert.alert(
        "User Data Missing",
        "Logged-in user information could not be found. Please login again."
      );
      return;
    }

    const employeeNumber = user?.employeeNumber
      ? String(user.employeeNumber)
      : "";

    const employeeName = user?.name ? String(user.name) : "";

    const employeeEmail = user?.email ? String(user.email) : "";

    const storeId = user?.siteCode ?? user?.siteId ?? "";

    const storeName = user?.employeeLocationSAP || user?.location || "";

    const finalStoreId =
      storeId !== null && storeId !== undefined ? String(storeId) : "";

    if (!employeeNumber) {
      Alert.alert(
        "User Data Missing",
        "Employee number is missing from the logged-in user data."
      );
      return;
    }

    if (!employeeName) {
      Alert.alert(
        "User Data Missing",
        "Employee name is missing from the logged-in user data."
      );
      return;
    }

    if (!employeeEmail) {
      Alert.alert(
        "User Data Missing",
        "Employee email is missing from the logged-in user data."
      );
      return;
    }

    if (!finalStoreId) {
      Alert.alert(
        "Store Data Missing",
        "Store ID is missing from the logged-in user data."
      );
      return;
    }

    if (!storeName) {
      Alert.alert(
        "Store Data Missing",
        "Store name/location is missing from the logged-in user data."
      );
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        // CUSTOMER DETAILS
        mobile: cleanMobile,
        customerName: cleanName,

        // STORE DETAILS
        storeId: finalStoreId,
        storeName: storeName,

        // SALESMAN DETAILS
        salesmanId: employeeNumber,
        salesmanName: employeeName,
        salesmanEmail: employeeEmail,

        // PRODUCT CODES
        products: scannedProducts,

        // REMARKS (OPTIONAL)
        remarks: remarks.trim(),

        // SUBMISSION DETAILS
        submittedAt: new Date().toISOString(),
        status: "SUBMITTED",
      };

      console.log("=================================");
      console.log("QR LEAD PAYLOAD");
      console.log(JSON.stringify(payload, null, 2));
      console.log("=================================");

      const response = await api.post("/qrleads", payload);

      console.log("QR Lead Response:", response);

      if (response?.success) {
        Alert.alert(
          "Lead Submitted",
          "Customer lead has been submitted successfully.",
          [
            {
              text: "OK",
              onPress: resetLead,
            },
          ]
        );
      } else {
        Alert.alert(
          "Submission Failed",
          response?.message || "Unable to submit the lead."
        );
      }
    } catch (error) {
      console.error("QR Lead Submit Error:", error?.message || error);

      Alert.alert(
        "Submission Failed",
        error?.message ||
          "Something went wrong while submitting the lead."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================
  // RESET AFTER SUCCESS
  // =========================================================
  const resetLead = () => {
    setStep(1);
    setMobile("");
    setCustomerName("");
    setRemarks("");
    setScannedProducts([]);
    setScanned(false);
    scanCooldownRef.current = false;
    animateZoomTo(ZOOM_MIN, 0);
  };

  // =========================================================
  // USER DATA LOADING
  // =========================================================
  if (loadingUser) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#EA580C" />

        <Text style={styles.permissionText}>
          Loading user information...
        </Text>
      </View>
    );
  }

  // =========================================================
  // USER DATA NOT FOUND
  // =========================================================
  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="person-off" size={55} color="#EA580C" />

        <Text style={styles.permissionText}>
          User Information Not Found
        </Text>

        <Text style={styles.subText}>
          Please login again before creating a customer lead.
        </Text>
      </View>
    );
  }

  // =========================================================
  // STEP 2
  // CUSTOMER DETAILS FORM (after scanning)
  // =========================================================
  if (step === 2) {
    return (
      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* BACK TO SCAN */}
          <Pressable
            style={styles.formBackButton}
            onPress={handleBackToScan}
            disabled={submitting}
          >
            <MaterialIcons name="arrow-back" size={22} color="#EA580C" />

            <Text style={styles.formBackText}>Scan more products</Text>
          </Pressable>

          {/* ICON */}
          <View style={styles.headerIcon}>
            <MaterialIcons name="person-add" size={38} color="#EA580C" />
          </View>

          {/* TITLE */}
          <Text style={styles.formTitle}>Customer Details</Text>

          <Text style={styles.formSubtitle}>
            Enter customer details to submit the lead
          </Text>

          {/* PRODUCTS SUMMARY */}
          <View style={styles.productsSummaryCard}>
            <View style={styles.productsSummaryHeader}>
              <Text style={styles.productsSummaryTitle}>
                Scanned Products
              </Text>

              <View style={styles.productCount}>
                <Text style={styles.productCountNumber}>
                  {scannedProducts.length}
                </Text>
              </View>
            </View>

            {scannedProducts.map((code, index) => (
              <View key={code} style={styles.productItem}>
                <View style={styles.tickCircle}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productNumber}>
                    Product {index + 1}
                  </Text>

                  <Text style={styles.productCode}>{code}</Text>
                </View>

                <Pressable
                  onPress={() => removeProduct(code)}
                  style={styles.removeButton}
                  disabled={submitting}
                >
                  <MaterialIcons name="close" size={20} color="#777" />
                </Pressable>
              </View>
            ))}
          </View>

          {/* MOBILE */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Customer Mobile Number</Text>

            <View style={styles.inputWrapper}>
              <MaterialIcons name="phone" size={21} color="#777" />

              <TextInput
                style={styles.input}
                value={mobile}
                onChangeText={(text) => {
                  const numbersOnly = text.replace(/[^0-9]/g, "");
                  setMobile(numbersOnly);
                }}
                placeholder="Enter mobile number"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          </View>

          {/* CUSTOMER NAME */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Customer Name</Text>

            <View style={styles.inputWrapper}>
              <MaterialIcons
                name="person-outline"
                size={21}
                color="#777"
              />

              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Enter customer name"
                placeholderTextColor="#999"
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* REMARKS */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Remarks (optional)</Text>

            <TextInput
              style={styles.remarksInput}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add any remarks..."
              placeholderTextColor="#999"
              multiline
            />
          </View>

          {/* SUBMIT */}
          <Pressable
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
            onPress={submitLead}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />

                <Text style={styles.submitButtonText}>Submitting...</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="check-circle" size={22} color="#fff" />

                <Text style={styles.submitButtonText}>Submit Lead</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // =========================================================
  // CAMERA PERMISSION LOADING
  // =========================================================
  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#EA580C" />

        <Text style={styles.permissionText}>
          Checking camera permission...
        </Text>
      </View>
    );
  }

  // =========================================================
  // CAMERA PERMISSION NOT GRANTED
  // =========================================================
  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="camera-alt" size={55} color="#EA580C" />

        <Text style={styles.permissionText}>
          Camera Permission Required
        </Text>

        <Text style={styles.subText}>
          We need camera access to scan product barcodes and QR codes.
        </Text>

        <Pressable
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  // =========================================================
  // STEP 1
  // PRODUCT SCANNER (first screen)
  // =========================================================
  return (
    <View style={styles.scannerContainer}>
      {/* CAMERA */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoomTarget}
        autofocus="on"
        barcodeScannerSettings={{
          barcodeTypes: [
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            "code128",
            "code39",
            "code93",
            "codabar",
            "itf14",
          ],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* HEADER */}
      <View style={styles.scannerHeader}>
        <View>
          <Text style={styles.scannerHeaderTitle}>Scan Products</Text>

          <Text style={styles.scannerHeaderCustomer}>
            Scan first, then add customer details
          </Text>
        </View>
      </View>

      {/* SCANNER BOX */}
      <Pressable style={styles.overlay} onPress={handleTapToAssist}>
        <View style={styles.scannerBox}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
        </View>

        <Text style={styles.scanText}>
          {scanned ? "Product added" : "Scan product barcode or QR code"}
        </Text>

        {!scanned && (
          <Text style={styles.zoomHintText}>
            Too far? Tap here to zoom in
          </Text>
        )}
      </Pressable>

      {/* BOTTOM PANEL */}
      <View style={styles.bottomPanel}>
        {/* PRODUCT COUNT */}
        <View style={styles.customerSummary}>
          <View style={styles.customerSummaryInfo}>
            <Text style={styles.summaryLabel}>Step 1 of 2</Text>

            <Text style={styles.summaryName}>Scanned Products</Text>
          </View>

          <View style={styles.productCount}>
            <Text style={styles.productCountNumber}>
              {scannedProducts.length}
            </Text>

            <Text style={styles.productCountLabel}>Products</Text>
          </View>
        </View>

        {/* PRODUCT LIST */}
        {scannedProducts.length > 0 ? (
          <ScrollView
            style={styles.productList}
            showsVerticalScrollIndicator={false}
          >
            {scannedProducts.map((code, index) => (
              <View key={code} style={styles.productItem}>
                <View style={styles.tickCircle}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productNumber}>
                    Product {index + 1}
                  </Text>

                  <Text style={styles.productCode}>{code}</Text>
                </View>

                <Pressable
                  onPress={() => removeProduct(code)}
                  style={styles.removeButton}
                >
                  <MaterialIcons name="close" size={20} color="#777" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noProductsText}>No products scanned yet.</Text>
        )}

        {/* SCAN NEXT PRODUCT */}
        {scanned && (
          <Pressable style={styles.scanAgainButton} onPress={scanAgain}>
            <MaterialIcons
              name="qr-code-scanner"
              size={21}
              color="#EA580C"
            />

            <Text style={styles.scanAgainText}>Scan Next Product</Text>
          </Pressable>
        )}

        {/* NEXT -> CUSTOMER DETAILS */}
        <Pressable
          style={[
            styles.nextButton,
            scannedProducts.length === 0 && styles.submitButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={scannedProducts.length === 0}
        >
          <Text style={styles.nextButtonText}>Next: Customer Details</Text>

          <MaterialIcons name="arrow-forward" size={21} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// ===========================================================
// STYLES
// ===========================================================

const styles = StyleSheet.create({
  // =========================================================
  // FORM
  // =========================================================

  formContainer: {
    flex: 1,
    backgroundColor: "#F7F9FC",
  },

  formContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 50,
  },

  formBackButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 14,
  },

  formBackText: {
    color: "#EA580C",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 6,
  },

  headerIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FDEBDD",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },

  formTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
  },

  formSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 25,
  },

  productsSummaryCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9DEE7",
    borderRadius: 12,
    padding: 14,
    marginBottom: 22,
  },

  productsSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  productsSummaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },

  inputContainer: {
    marginBottom: 20,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },

  inputWrapper: {
    height: 54,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9DEE7",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#111827",
  },

  nextButton: {
    marginTop: 12,
    height: 52,
    backgroundColor: "#EA580C",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },

  // =========================================================
  // PERMISSION
  // =========================================================

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },

  permissionText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },

  subText: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },

  permissionButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#EA580C",
  },

  permissionButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // =========================================================
  // SCANNER
  // =========================================================

  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },

  scannerHeader: {
    position: "absolute",
    top: 45,
    left: 15,
    right: 15,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  scannerHeaderTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700",
  },

  scannerHeaderCustomer: {
    color: "#E5E7EB",
    fontSize: 13,
    marginTop: 2,
  },

  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scannerBox: {
    width: 290,
    height: 180,
    position: "relative",
  },

  cornerTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 35,
    height: 35,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#fff",
  },

  cornerTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 35,
    height: 35,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#fff",
  },

  cornerBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 35,
    height: 35,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#fff",
  },

  cornerBottomRight: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 35,
    height: 35,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#fff",
  },

  scanText: {
    marginTop: 20,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },

  zoomHintText: {
    marginTop: 8,
    color: "#D1D5DB",
    fontSize: 12,
    textAlign: "center",
  },

  // =========================================================
  // BOTTOM PANEL
  // =========================================================

  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    padding: 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "52%",
  },

  customerSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  customerSummaryInfo: {
    flex: 1,
  },

  summaryLabel: {
    fontSize: 12,
    color: "#777",
  },

  summaryName: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },

  productCount: {
    alignItems: "center",
    backgroundColor: "#FDEBDD",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },

  productCountNumber: {
    fontSize: 17,
    fontWeight: "700",
    color: "#EA580C",
  },

  productCountLabel: {
    fontSize: 10,
    color: "#555",
  },

  productList: {
    maxHeight: 170,
    marginTop: 10,
  },

  productItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  tickCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  productInfo: {
    flex: 1,
    marginLeft: 11,
  },

  productNumber: {
    fontSize: 11,
    color: "#777",
  },

  productCode: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },

  removeButton: {
    padding: 5,
  },

  noProductsText: {
    textAlign: "center",
    color: "#777",
    fontSize: 14,
    paddingVertical: 18,
  },

  // =========================================================
  // REMARKS
  // =========================================================

  remarksInput: {
    minHeight: 70,
    maxHeight: 120,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9DEE7",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    textAlignVertical: "top",
  },

  // =========================================================
  // SCAN NEXT
  // =========================================================

  scanAgainButton: {
    marginTop: 12,
    height: 46,
    borderWidth: 1,
    borderColor: "#EA580C",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  scanAgainText: {
    color: "#EA580C",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 7,
  },

  // =========================================================
  // SUBMIT
  // =========================================================

  submitButton: {
    marginTop: 10,
    height: 52,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  submitButtonDisabled: {
    backgroundColor: "#A5A5A5",
  },

  submitButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
  },
});