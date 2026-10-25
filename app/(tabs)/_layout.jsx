import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import ResponsiveTabLabel from "../../components/ResponsiveTabLabel";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#ff7b00",
        // No side padding so 7 tabs get the full width
        tabBarItemStyle: {
          paddingHorizontal: 0,
        },
        // Same bold label size on every tab, sized to the device width.
        // longestLabelChars = longest title below ("Leaders"/"NewLead"/"Profile")
        tabBarLabel: ({ color, children }) => (
          <ResponsiveTabLabel color={color} tabCount={7} longestLabelChars={7}>
            {children}
          </ResponsiveTabLabel>
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Target",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bullseye-arrow" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          // Short label so it fits at the same size as the other tabs
          title: "Leaders",
          tabBarIcon: ({ color, size }) => (
            // crown glyph draws a little small — +2 to match the others
            <MaterialCommunityIcons name="crown-outline" size={size + 2} color={color} />
          ),
        }}
      />

  

      <Tabs.Screen
        name="LMS"
        options={{
          title: "LMS",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />

    <Tabs.Screen
        name="attend"
        options={{
          title: "Attend",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="finger-print-outline" size={size} color={color} />
          ),
        }}
      />
      
      {/* NEW TAB */}
      <Tabs.Screen
        name="lead"
        options={{
          title: "Lead",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="barcode"
        options={{
          title: "NewLead",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="qr-code-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="person-circle-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Drawer only — not shown in the bottom bar */}
      <Tabs.Screen
        name="checklist"
        options={{
          title: "Checklist",
          href: null,
        }}
      />

    </Tabs>
  );
}