import { withAndroidManifest } from "expo/config-plugins.js";

const withLargeScreenBarcodeScanner = (config) =>
    withAndroidManifest(config, (manifestConfig) => {
        const manifest = manifestConfig.modResults.manifest;
        const applications = manifest.application;
        const activities = applications?.flatMap(
            (application) => application.activity ?? [],
        );

        const barcodeActivity = activities?.find(
            (activity) =>
                activity.$?.["android:name"] ===
                "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
        );

        if (barcodeActivity) {
            delete barcodeActivity.$["android:screenOrientation"];
        } else if (applications?.[0]) {
            manifest.$["xmlns:tools"] ??=
                "http://schemas.android.com/tools";
            applications[0].activity ??= [];
            applications[0].activity.push({
                $: {
                    "android:name":
                        "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
                    "tools:node": "merge",
                    "tools:remove": "android:screenOrientation",
                },
            });
        }

        return manifestConfig;
    });

export default {
    expo: {
        name: "HT-ontrack",
        slug: "myapp",
        version: "1.0.0",
        orientation: "default",
        icon: "./assets/images/logo.jpg",
        scheme: "myapp",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,

        ios: {
            supportsTablet: true,
            bundleIdentifier: "ontrack.hometown",

            config: {
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
            },

            infoPlist: {
                NSLocationWhenInUseUsageDescription:
                    "Allow app to access your location.",
                NSLocationAlwaysAndWhenInUseUsageDescription:
                    "Allow app to track your location.",
                NSLocationAlwaysUsageDescription:
                    "Allow app to track your location.",
                NSMotionUsageDescription:
                    "Motion detection helps save battery while checking if you have left the store.",
                // react-native-background-geolocation (auto check-out)
                TSLocationManagerLicense: process.env.BGGEO_LICENSE_IOS,
                UIBackgroundModes: ["location", "fetch", "processing"],
                BGTaskSchedulerPermittedIdentifiers: ["com.transistorsoft.fetch"],
            },
        },

        android: {
            versionCode: 8,
            permissions: [
                "ACCESS_FINE_LOCATION",
                "ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_BACKGROUND_LOCATION",
                "android.permission.FOREGROUND_SERVICE",
                "android.permission.FOREGROUND_SERVICE_LOCATION",
            ],
            // Added by react-native-background-geolocation for motion detection.
            // Google Play treats it as a health permission; auto attendance
            // doesn't need it (motion updates are disabled in autoAttendance.service).
            blockedPermissions: [
                "android.permission.ACTIVITY_RECOGNITION",
                "com.google.android.gms.permission.ACTIVITY_RECOGNITION",
            ],

            adaptiveIcon: {
                backgroundColor: "#E6F4FE",
                foregroundImage: "./assets/images/logo.jpg",
                backgroundImage:
                    "./assets/images/android-icon-background.png",
                monochromeImage:
                    "./assets/images/android-icon-monochrome.png",
            },

            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false,

            package: "ontrack.hometown",

            config: {
                googleMaps: {
                    apiKey: process.env.GOOGLE_MAPS_API_KEY,
                },
            },
        },

        web: {
            output: "static",
            favicon: "./assets/images/favicon.png",
        },

        plugins: [
            "expo-router",
            "expo-camera",
            withLargeScreenBarcodeScanner,

            [
                "expo-build-properties",
                {
                    android: {
                        enableMinifyInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        // The headless app loader is only looked up by name from the
                        // manifest, so R8 strips it and background tasks crash with an
                        // NPE in TaskService.executeTask when the app isn't running.
                        extraProguardRules: [
                            "-keep class expo.modules.adapters.react.apploader.** { *; }",
                            "-keep class expo.modules.apploader.** { *; }",
                            "-keep class expo.modules.taskManager.** { *; }",
                        ].join("\n"),
                    },
                },
            ],

            [
                "expo-location",
                {
                    locationWhenInUsePermission:
                        "Allow app to access your location.",
                    locationAlwaysAndWhenInUsePermission:
                        "Allow app to track your location.",
                    isAndroidBackgroundLocationEnabled: true,
                    isAndroidForegroundServiceEnabled: true,
                },
            ],

            // Auto check-out when leaving the store (services/autoCheckout.service.js).
            // Keys come from .env locally and EAS environment variables in cloud builds.
            [
                "react-native-background-geolocation",
                {
                    license: process.env.BGGEO_LICENSE_ANDROID,
                },
            ],

            [
                "expo-audio",
                {
                    microphonePermission:
                        "Allow HT-ontrack to use the microphone to record customer calls.",
                    enableBackgroundRecording: true,
                },
            ],

            [
                "expo-splash-screen",
                {
                    image: "./assets/images/logo.jpg",
                    imageWidth: 200,
                    resizeMode: "contain",
                    backgroundColor: "#ffffff",
                },
            ],
        ],

        experiments: {
            typedRoutes: true,
            reactCompiler: true,
        },

        extra: {
            router: {},
            eas: {
                projectId: "3c74e2fb-a5fb-4216-bc23-6ab804ef9bbf",
            },
        },
    },
};