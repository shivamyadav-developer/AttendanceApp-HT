
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import LocationDisclosureModal from "../components/LocationDisclosureModal";
import authService from "../services/auth.service";
import locationService from "../services/location.service";

const SHIPMENT_USERNAME = "RC000400";
const SHIPMENT_PASSWORD = "Password@123";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);

  // Location disclosure state
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  const manualLoginStartedRef = useRef(false);

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      const userData = await AsyncStorage.getItem("userData");

      if (!token || !userData) return;

      const user = JSON.parse(userData);

      // User is already logged in.
      // Do NOT show the location disclosure when simply
      // reopening the app with an active session.
      setPendingUser(user);
      setChecking(true);

      const trackingStarted = await locationService.startTracking();

      if (!trackingStarted) {
        await authService.logout();
        setPendingUser(null);

        Alert.alert(
          "Location Permission Required",
          "Location access is required for attendance tracking."
        );

        return;
      }

      setPendingUser(null);

      const jobTitle = (user.jobTitle || "").toUpperCase();

      if (jobTitle === "FITTER") {
        router.replace("/(fitter)/attendance");
        return;
      }

      if (
        jobTitle === "LOGISTICS EXECUTIVE" ||
        jobTitle === "DELIVERY EXECUTIVE"
      ) {
        router.replace("/(delivery)/attendance");
        return;
      }

      router.replace("/(tabs)/home");
    } catch (error) {
      console.log("Existing login check error:", error);
    } finally {
      setChecking(false);
    }
  };

  // Auto-login using saved credentials — runs once on mount, not gated
  // on office location. Bails out if a session already exists, or if the
  // user manually logs in before this resolves.
  useEffect(() => {
    let cancelled = false;

    const attemptAutoLogin = async () => {
      try {
        const saved = await AsyncStorage.getItem("savedCredentials");
        if (!saved || cancelled || manualLoginStartedRef.current) return;

        const currentToken = await AsyncStorage.getItem("userToken");
        if (currentToken) return; // already logged in — don't overwrite

        const { username: savedUsername, password: savedPassword } =
          JSON.parse(saved);

        const result = await authService.login(
          savedUsername,
          savedPassword
        );

        // If the user started a manual login while this was in flight,
        // discard this result entirely — don't overwrite their session.
        if (cancelled || manualLoginStartedRef.current) return;

        if (result.success) {
          const user = result.user;

          // Auto-login is an existing authenticated session.
          // Do NOT show the location disclosure when the app opens
          // and logs the user in automatically.
          setPendingUser(user);
          setChecking(true);

          const trackingStarted =
            await locationService.startTracking();

          if (!trackingStarted) {
            await authService.logout();
            setPendingUser(null);

            Alert.alert(
              "Location Permission Required",
              "Location access is required for attendance tracking."
            );

            return;
          }

          setPendingUser(null);

          const jobTitle = (user.jobTitle || "").toUpperCase();

          if (jobTitle === "FITTER") {
            Alert.alert("Success", `Welcome ${user.name}`);
            router.replace("/(fitter)/attendance");
            return;
          }

          if (
            jobTitle === "LOGISTICS EXECUTIVE" ||
            jobTitle === "DELIVERY EXECUTIVE"
          ) {
            Alert.alert("Success", `Welcome ${user.name}`);
            router.replace("/(delivery)/attendance");
            return;
          }

          Alert.alert("Success", `Welcome ${user.name}`);
          router.replace("/(tabs)/home");
        }
      } catch (e) {
        console.log("Auto login error:", e);
      }
    };

    attemptAutoLogin();

    return () => {
      cancelled = true;
    };
  }, []);

  // Start location tracking only AFTER the user has seen
  // the prominent disclosure and tapped "Agree & Continue".
  const handleLocationContinue = async () => {
    if (!pendingUser) return;

    try {
      setShowLocationDisclosure(false);
      setChecking(true);

      const trackingStarted = await locationService.startTracking();

      if (!trackingStarted) {
        // Tracking failed, so do not keep the disclosure
        // acceptance as valid.
        await AsyncStorage.removeItem(
          "locationDisclosureAccepted"
        );

        await authService.logout();

        setPendingUser(null);

        Alert.alert(
          "Location Permission Required",
          "Location access is required for attendance tracking."
        );

        return;
      }

      // Location tracking successfully started.
      // The disclosure will be shown again on the next login.

      const user = pendingUser;
      setPendingUser(null);

      const jobTitle = (user.jobTitle || "").toUpperCase();

      if (jobTitle === "FITTER") {
        Alert.alert("Success", `Welcome ${user.name}`);
        router.replace("/(fitter)/attendance");
        return;
      }

      if (
        jobTitle === "LOGISTICS EXECUTIVE" ||
        jobTitle === "DELIVERY EXECUTIVE"
      ) {
        Alert.alert("Success", `Welcome ${user.name}`);
        router.replace("/(delivery)/attendance");
        return;
      }

      Alert.alert("Success", `Welcome ${user.name}`);
      router.replace("/(tabs)/home");
    } catch (error) {
      console.log("Location tracking error:", error);

      // Tracking failed, so make sure the acceptance flag
      // does not prevent the disclosure from appearing again.
      try {
        await AsyncStorage.removeItem(
          "locationDisclosureAccepted"
        );
      } catch (storageError) {
        console.log(
          "Location disclosure storage cleanup error:",
          storageError
        );
      }

      try {
        await authService.logout();
      } catch (logoutError) {
        console.log("Logout error:", logoutError);
      }

      setPendingUser(null);

      Alert.alert(
        "Location Permission Required",
        "Location access is required for attendance tracking."
      );
    } finally {
      setChecking(false);
    }
  };

  // User declines the location disclosure
  const handleLocationDecline = async () => {
    try {
      setShowLocationDisclosure(false);
      setPendingUser(null);

      // Clear the authenticated session because location access
      // is required for attendance tracking.
      await authService.logout();
    } catch (error) {
      console.log("Decline location error:", error);
    }
  };

  // Manual Login with OnTrack API - allows login from anywhere
  const login = async () => {
    if (!username || !password) {
      Alert.alert(
        "Error",
        "Please enter both Employee Number and Password"
      );
      return;
    }

    manualLoginStartedRef.current = true;

    try {
      setChecking(true);

      const enteredUsername = username.trim().toUpperCase();

      // ==========================================
      // SHIPMENT LOGIN
      // ==========================================
      if (enteredUsername === SHIPMENT_USERNAME) {
        if (password !== SHIPMENT_PASSWORD) {
          Alert.alert("Login Failed", "Invalid Shipment password.");
          return;
        }

        const shipmentUser = {
          employeeNumber: SHIPMENT_USERNAME,
          username: SHIPMENT_USERNAME,
          name: "Shipment User",
          jobTitle: "SHIPMENT",
          role: "SHIPMENT",
        };

        await AsyncStorage.setItem(
          "userToken",
          "shipment-local-token"
        );

        await AsyncStorage.setItem(
          "userData",
          JSON.stringify(shipmentUser)
        );

        await AsyncStorage.removeItem("savedCredentials");

        Alert.alert(
          "Login Successful",
          "Welcome to Shipment Dashboard"
        );

        // Shipment Dashboard
        router.replace("/(shipment)/new-trip");

        return;
      }

      // ==========================================
      // NORMAL LOGIN
      // ==========================================
      const result = await authService.login(username, password);

      if (!result.success) {
        Alert.alert("Login Failed", result.message);
        return;
      }

      const user = result.user;

      await AsyncStorage.setItem(
        "savedCredentials",
        JSON.stringify({
          username,
          password,
        })
      );

      setPendingUser(user);
      setShowLocationDisclosure(true);

    } catch (error) {
      console.log(error);
      Alert.alert("Error", "An error occurred during login.");
    } finally {
      setChecking(false);
    }
  };

  // Optional: Show registration option
  const goToRegister = () => {
    router.push("/register");
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="light-content" />

        {/* Logo + Brand */}
        <View style={styles.logoContainer}>
          <Text style={styles.brand}>
            <Text style={styles.brandHome}>Home</Text>
            <Text style={styles.brandTown}>Town</Text>
            <Text style={styles.brandOnTrack}> OnTrack</Text>
          </Text>

          <View style={styles.tagPill}>
            <MaterialIcons name="auto-awesome" size={13} color="#fff" />
            <Text style={styles.tag}> Smart Retail Workforce Platform</Text>
          </View>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.personIconWrapper}>
            <MaterialIcons name="badge" size={24} color="#D96A17" />
          </View>

          <Text style={styles.portal}>TEAM PORTAL</Text>
          <Text style={styles.heading}>Staff Login</Text>
          <Text style={styles.subHeading}>
            {checking
              ? "Verifying your credentials…"
              : "Enter your employee number and password"}
          </Text>

          {/* Employee Number / Username */}
          <Text style={styles.label}>Employee Number</Text>
          <View style={styles.inputContainer}>
            <MaterialIcons name="badge" size={20} color="#D96A17" />

            <TextInput
              placeholder="Enter Username"
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!checking}
            />
          </View>

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputContainer}>
            <MaterialIcons name="lock-outline" size={20} color="#D96A17" />

            <TextInput
              placeholder="Enter Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              style={styles.input}
              editable={!checking}
            />

            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
            >
              <MaterialIcons
                name={showPassword ? "visibility" : "visibility-off"}
                size={20}
                color="#888"
              />
            </TouchableOpacity>
          </View>

          {/* Location notice */}
          <View style={styles.locationNote}>
            <MaterialIcons name="location-on" size={14} color="#D96A17" />

            <Text style={styles.locationText}>
              Location permissions required for attendance tracking
            </Text>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[
              styles.loginBtn,
              checking && styles.loginBtnDisabled
            ]}
            onPress={login}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginText}>
                Open Staff Dashboard →
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Use your assigned HomeTown employee credentials.
          </Text>
        </View>

        {/* Bottom */}
        <View style={styles.bottom}>
          <Text style={styles.bottomTitle}>
            <Text style={styles.brandHome}>Home</Text>
            <Text style={styles.brandTown}>Town</Text>
            <Text style={{ color: "#fff" }}>
              {" "}OnTrack Workforce App
            </Text>
          </Text>

          <TouchableOpacity
            onPress={() => Linking.openURL("https://www.hometown.in/")}
          >
            <Text style={styles.website}>Visit hometown.in</Text>
          </TouchableOpacity>
          <View style={styles.policyRow}>
            <MaterialIcons name="security" size={12} color="#D96A17" />

            <Text style={styles.policy}>
              {" "}
              Secure Login • Terms of Service • Privacy Policy
            </Text>
          </View>

          <Text style={styles.quote}>
            "Empowering every store team to learn, perform and grow."
          </Text>
        </View>
      </ScrollView>

      {/* Location Prominent Disclosure */}
      <LocationDisclosureModal
        visible={showLocationDisclosure}
        onContinue={handleLocationContinue}
        onDecline={handleLocationDecline}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#5C2D0C",
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: "center",
  },

  logoContainer: {
    alignItems: "center",
    marginBottom: 14
  },

  logo: {
    width: 80,
    height: 80,
    borderRadius: 40
  },

  brand: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 8
  },

  brandHome: {
    color: "#fff"
  },

  brandTown: {
    color: "#D96A17"
  },

  brandOnTrack: {
    color: "#F5C87A"
  },

  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6D3B16",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 7,
  },

  tag: {
    color: "#fff",
    fontSize: 11
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 18
  },

  personIconWrapper: {
    position: "absolute",
    top: 18,
    right: 18,
    backgroundColor: "#FFF0E6",
    borderRadius: 12,
    padding: 9,
  },

  portal: {
    color: "#D96A17",
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 1.5
  },

  heading: {
    fontSize: 28,
    fontWeight: "900",
    color: "#3A2415",
    marginTop: 3
  },

  subHeading: {
    color: "#777",
    marginTop: 2,
    marginBottom: 10,
    fontSize: 12
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
    color: "#3A2415"
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    backgroundColor: "#FAFAFA",
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14
  },

  demoNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF4EC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 12,
    gap: 6,
  },

  demoText: {
    fontSize: 11,
    color: "#D96A17",
    fontWeight: "500",
    flex: 1
  },

  locationNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF4EC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
    gap: 6,
  },

  locationText: {
    fontSize: 11,
    color: "#D96A17",
    fontWeight: "500",
    flex: 1
  },

  loginBtn: {
    backgroundColor: "#D96A17",
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
  },

  loginBtnDisabled: {
    backgroundColor: "#E8A97A"
  },

  loginText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700"
  },

  registerLink: {
    marginTop: 12,
    alignItems: "center"
  },

  registerText: {
    color: "#D96A17",
    fontSize: 13,
    fontWeight: "600"
  },

  footerText: {
    textAlign: "center",
    color: "#888",
    marginTop: 10,
    fontSize: 11
  },

  bottom: {
    marginTop: 14,
    alignItems: "center",
    gap: 4
  },

  bottomTitle: {
    fontSize: 13,
    fontWeight: "700"
  },

  website: {
    color: "#fff",
    textDecorationLine: "underline",
    fontSize: 12
  },

  policyRow: {
    flexDirection: "row",
    alignItems: "center"
  },

  policy: {
    color: "#ddd",
    fontSize: 10
  },

  quote: {
    color: "#bbb",
    fontSize: 10,
    fontStyle: "italic",
    textAlign: "center"
  },
});
