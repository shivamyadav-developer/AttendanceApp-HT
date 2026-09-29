import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

export default function ShipmentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#D96A17",
        tabBarInactiveTintColor: "#888",
        tabBarStyle: {
          height: 65,
          paddingBottom: 8,
          paddingTop: 5,
        },
      }}
    >
      <Tabs.Screen
        name="new-trip"
        options={{
          title: "New Trip",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="local-shipping"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="doc-upload"
        options={{
          title: "Doc Upload",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="description"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="vehicle-pic"
        options={{
          title: "Vehicle Pic",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="photo-camera"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="trip-status"
        options={{
          title: "Trip Status",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name="check-circle"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}