import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Heart, ShoppingBag, Sparkles, Store } from "lucide-react-native";
import { useAppState } from "@/lib/app-state";
import { colors } from "@/lib/theme";

// Classic JS tabs (not NativeTabs): this one codebase also ships as a web PWA,
// and NativeTabs is iOS/Android-only. Revisit if the app goes native-only.
export default function TabsLayout() {
  const { cartCount } = useAppState();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Web has no safe-area inset under the bar, so give the labels their own room.
        tabBarStyle: {
          backgroundColor: colors.card, borderTopColor: colors.border,
          ...(Platform.OS === "web" && { height: 68, paddingTop: 8, paddingBottom: 10 }),
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explorar",
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, size }) => <Heart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Mi plan",
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Canasta",
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary },
          tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
