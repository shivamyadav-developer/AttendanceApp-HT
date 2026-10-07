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
            },
        },

        android: {
            permissions: [
                "ACCESS_FINE_LOCATION",
                "ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_BACKGROUND_LOCATION",
                "android.permission.FOREGROUND_SERVICE",
                "android.permission.FOREGROUND_SERVICE_LOCATION",
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