import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function FitterLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0F7A5C",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >

    {/* Fitter Dashboard */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="dashboard"
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
          title: "Attendance",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="how-to-reg"
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
            <MaterialIcons
              name="build"
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
            <MaterialIcons
              name="check-circle"
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
            <MaterialIcons
              name="assignment"
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
            <MaterialIcons
              name="person"
              color={color}
              size={size}
            />
          ),
        }}
      />


    </Tabs>
  );
}