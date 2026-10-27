import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { AppStateProvider } from "@/lib/app-state";
import { ToastHost } from "@/lib/toast";
import { OfflineBanner } from "@/components/offline-banner";
import { ProductModal } from "@/components/product-modal";
import { DialogsHost } from "@/components/app-dialogs";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar style="auto" />
      <View style={styles.backdrop}>
        <View style={styles.column}>
          <Stack screenOptions={{ headerShown: false }}>
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
  );
}

// On a desktop browser the PWA keeps its phone layout in a centered column instead of stretching edge to edge.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Platform.OS === "web" ? colors.muted : colors.background },
  column: Platform.OS === "web"
    ? { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: colors.background, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border }
    : { flex: 1 },
});
