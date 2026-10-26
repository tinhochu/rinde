import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "./theme";

// Minimal sonner-equivalent: module-level toast.success()/toast.error() API so
// ported screens keep the same call sites. Render <ToastHost/> once at root.
type Toast = { id: number; kind: "success" | "error"; message: string };

let pushToast: ((kind: Toast["kind"], message: string, duration?: number) => void) | null = null;

export const toast = {
  success: (message: string, opts?: { duration?: number }) => pushToast?.("success", message, opts?.duration),
  error: (message: string, opts?: { duration?: number }) => pushToast?.("error", message, opts?.duration),
};

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const id = useRef(0);

  const push = useCallback((kind: Toast["kind"], message: string, duration = 2600) => {
    id.current += 1;
    const current = id.current;
    setToasts(previous => [...previous.slice(-2), { id: current, kind, message }]);
    setTimeout(() => setToasts(previous => previous.filter(t => t.id !== current)), duration);
  }, []);

  useEffect(() => {
    pushToast = push;
    return () => {
      pushToast = null;
    };
  }, [push]);

  if (!toasts.length) return null;
  return (
    <SafeAreaView pointerEvents="none" style={styles.host}>
      <View style={styles.stack}>
        {toasts.map(t => (
          <View key={t.id} style={[styles.toast, t.kind === "error" ? styles.error : styles.success]}>
            <Text style={styles.text}>{t.message}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, alignItems: "center" },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, width: "100%", maxWidth: 480 },
  toast: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" },
  success: { backgroundColor: colors.primary },
  error: { backgroundColor: colors.destructive },
  text: { color: "#FFFFFF", fontSize: fontSize.body, fontWeight: "600", textAlign: "center" },
});
