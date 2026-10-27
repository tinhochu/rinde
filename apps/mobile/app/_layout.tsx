import { Platform, StyleSheet, View } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { AppStateProvider } from "@/lib/app-state";
import { ToastHost } from "@/lib/toast";
import { OfflineBanner } from "@/components/offline-banner";
import { ProductModal } from "@/components/product-modal";
import { DialogsHost } from "@/components/app-dialogs";
import { colors, scheme } from "@/lib/theme";

// The navigator paints behind every screen (and shows during tab switches); give it Rinde's colors, not
// React Navigation's white defaults, so dark mode never flashes white.
const base = scheme === "dark" ? DarkTheme : DefaultTheme;
const navigationTheme = {
  ...base,
  colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border, notification: colors.destructive },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <AppStateProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <View style={styles.backdrop}>
          <View style={styles.column}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="account" options={{ presentation: "modal" }} />
              {/* Search and product pages sit over the tabs: their own Back, no tab bar competing with the results. */}
              <Stack.Screen name="search" />
              <Stack.Screen name="product/[id]" />
              <Stack.Screen name="receipt" />
              <Stack.Screen name="contributions" />
            </Stack>
            <OfflineBanner />
            <ProductModal />
            <DialogsHost />
            <ToastHost />
          </View>
        </View>
      </AppStateProvider>
    </ThemeProvider>
  );
}

// On a desktop browser the PWA keeps its phone layout in a centered column instead of stretching edge to edge.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Platform.OS === "web" ? colors.muted : colors.background },
  column: Platform.OS === "web"
    ? { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: colors.background, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border }
    : { flex: 1 },
});
