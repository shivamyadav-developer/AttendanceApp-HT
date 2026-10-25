// Force update via Google Play In-App Updates (Android).
//
// On app start and every time the app comes back to the foreground, ask
// Google Play whether a newer version is published. If yes, start Play's
// full-screen "immediate" update and block the app with this screen until
// the user updates — pressing Back / cancelling only brings them back here.
//
// It only works for apps installed from the Play Store. On an APK installed
// directly, in Expo Go, on iOS, or if the check fails, the app is NOT blocked.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const PLAY_STORE_URL = "market://details?id=ontrack.hometown";
const PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=ontrack.hometown";

// Native module — missing in Expo Go / builds made before it was added
let InAppUpdates = null;
if (Platform.OS === "android") {
  try {
    InAppUpdates = require("expo-in-app-updates");
  } catch (e) {
    console.warn("[ForceUpdate] expo-in-app-updates not in this build:", e?.message);
  }
}

export default function ForceUpdateGate() {
  const [required, setRequired] = useState(false);
  const [starting, setStarting] = useState(false);
  const checkingRef = useRef(false);
  // Open Play's update screen by itself only once per app session; after a
  // cancel the user stays on the block screen and taps "Update now".
  const autoStartedRef = useRef(false);

  const startUpdate = useCallback(async () => {
    setStarting(true);
    try {
      const started = await InAppUpdates.startUpdate(true); // immediate
      if (!started) throw new Error("Update flow not started");
    } catch (e) {
      // Play's in-app flow unavailable — send them to the store page instead
      console.warn("[ForceUpdate] In-app update failed, opening Play Store:", e?.message);
      Linking.openURL(PLAY_STORE_URL).catch(() => Linking.openURL(PLAY_STORE_WEB_URL));
    } finally {
      setStarting(false);
    }
  }, []);

  const check = useCallback(async () => {
    if (!InAppUpdates || __DEV__ || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const info = await InAppUpdates.checkForUpdate();
      // updateInProgress: an immediate update was interrupted — resume it
      const needsUpdate = !!(info.updateAvailable || info.updateInProgress);
      setRequired(needsUpdate);
      if (needsUpdate && !autoStartedRef.current) {
        console.log("[ForceUpdate] Update required — store version", info.storeVersion);
        autoStartedRef.current = true;
        startUpdate();
      }
    } catch (e) {
      // Not installed from Play, no Play Store, offline… — never lock the user out
      console.warn("[ForceUpdate] Update check failed:", e?.message);
    } finally {
      checkingRef.current = false;
    }
  }, [startUpdate]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, [check]);

  if (!required) return null;

  return (
    // onRequestClose does nothing: Back cannot dismiss it
    <Modal visible animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={46} color="#D96A17" />
        </View>
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.text}>
          A new version of HT-ontrack is available with important changes. Please update to
          continue using the app.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          onPress={startUpdate}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google-playstore" size={20} color="#fff" />
              <Text style={styles.buttonText}>Update now</Text>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3EEE8",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FFF4EC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#0F2D52" },
  text: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 28,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D96A17",
    borderRadius: 14,
    paddingVertical: 15,
    alignSelf: "stretch",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
