import { StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Heart, ListChecks, Sparkles, Store, UserRound, type LucideIcon } from "lucide-react-native";
import { useAppState } from "@/lib/app-state";
import { tabBarStyle } from "@/lib/navigation";
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
        tabBarStyle,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explorar",
          tabBarIcon: ({ color, focused }) => <TabIcon icon={Store} color={String(color)} focused={focused} />,
          tabBarLabel: ({ color, focused, children }) => <TabLabel color={String(color)} focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, focused }) => <TabIcon icon={Heart} color={String(color)} focused={focused} fill />,
          tabBarLabel: ({ color, focused, children }) => <TabLabel color={String(color)} focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Mi plan",
          tabBarIcon: ({ color, focused }) => <TabIcon icon={Sparkles} color={String(color)} focused={focused} />,
          tabBarLabel: ({ color, focused, children }) => <TabLabel color={String(color)} focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Mi lista",
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary },
          tabBarIcon: ({ color, focused }) => <TabIcon icon={ListChecks} color={String(color)} focused={focused} />,
          tabBarLabel: ({ color, focused, children }) => <TabLabel color={String(color)} focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => <TabIcon icon={UserRound} color={String(color)} focused={focused} />,
          tabBarLabel: ({ color, focused, children }) => <TabLabel color={String(color)} focused={focused}>{children}</TabLabel>,
        }}
      />
    </Tabs>
  );
}

/**
 * The active tab gets a green pill behind a heavier icon (filled where the shape allows) and a bold label,
 * so where you are doesn't depend on telling two greens apart.
 */
function TabIcon({ icon: Icon, color, focused, fill = false }: { icon: LucideIcon; color: string; focused: boolean; fill?: boolean }) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Icon color={color} size={22} strokeWidth={focused ? 2.5 : 1.8} fill={focused && fill ? color : "transparent"} />
    </View>
  );
}

function TabLabel({ color, focused, children }: { color: string; focused: boolean; children: string }) {
  return <Text style={[styles.label, { color }, focused && styles.labelActive]}>{children}</Text>;
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: colors.secondary },
  label: { fontSize: 11, fontWeight: "500", marginTop: 2, color: colors.foreground },
  labelActive: { fontWeight: "800" },
});
