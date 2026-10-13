import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function DeliveryLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1565C0",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
          {/* Delivery Dashboard */}
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
      
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="event-available"
              color={color}
              size={size}
            />
          ),
        }}
      />

  

      {/* My Delivery Tasks */}
      <Tabs.Screen
        name="deliveries"
        options={{
          title: "Deliveries",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="local-shipping"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Existing Attendance */}


      {/* Existing Tracking */}
      <Tabs.Screen
        name="tracking"
        options={{
          title: "Tracking",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="local-shipping"
              color={color}
              size={size}
            />
          ),
        }}
      />
      {/* Delivery Details - hidden from bottom tab */}
      <Tabs.Screen
        name="delivery-detail"
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