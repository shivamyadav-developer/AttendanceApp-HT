import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function FitterLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#D96A17",
        tabBarInactiveTintColor: "#9CA3AF",
        // No side padding so 6 tabs get the full width
        tabBarItemStyle: {
          paddingHorizontal: 0,
        },
        // Bold, single-line label that shrinks slightly if it doesn't fit
        tabBarLabel: ({ color, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            allowFontScaling={false}
            style={{
              color,
              fontSize: 10,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            {children}
          </Text>
        ),
      }}
    >

      {/* Fitter Dashboard */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home"
              color={color}
              size={size}
            />
          ),
        }}
      />


      {/* Existing Attendance */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attend",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="finger-print-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Pending Fitting Jobs */}
      <Tabs.Screen
        name="fittings"
        options={{
          title: "Fittings",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="toolbox"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Completed Fitting Jobs */}
      <Tabs.Screen
        name="completed-fittings"
        options={{
          title: "Completed",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="clipboard-check"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Existing Tracking */}
      <Tabs.Screen
        name="tracking"
        options={{
          title: "Tracking",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="map-marker-radius"
              color={color}
              size={size}
            />
          ),
        }}
      />


      {/* Fitting Detail - NOT a bottom tab */}
      <Tabs.Screen
        name="fitting-detail"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      {/* Existing Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="person-circle-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />


    </Tabs>
  );
}