import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { AppStateProvider } from "@/lib/app-state";
import { ToastHost } from "@/lib/toast";
import { OfflineBanner } from "@/components/offline-banner";
import { ProductModal } from "@/components/product-modal";
import { DialogsHost } from "@/components/app-dialogs";

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <OfflineBanner />
      <ProductModal />
      <DialogsHost />
      <ToastHost />
    </AppStateProvider>
  );
}
