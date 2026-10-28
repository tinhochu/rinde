import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CircleCheck, Link } from "lucide-react-native";
import { InstallSteps } from "@/components/install-steps";
import { Button } from "@/components/ui";
import { track, trackLaunch, useInstall } from "@/lib/install";
import { toast } from "@/lib/toast";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const HEADLINE: Record<"prompt" | "ios" | "android" | "inapp", string> = {
  prompt: "Un toque y queda instalada.",
  ios: "En Safari son tres toques.",
  android: "Desde el menú del navegador, en tres toques.",
  inapp: "Primero ábrela en tu navegador.",
};

/**
 * Opens over Rinde on launch in a phone browser when Rinde isn't installed: what installing means and
 * the exact taps for this browser. Nothing once it's installed (opened from the home screen, or Chrome
 * says so), in the native app, or for 3 days after "Ahora no".
 */
export function InstallSplash() {
  const { way, install, welcome, snooze, copyLink } = useInstall();
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(welcome);
  useEffect(() => { if (!welcome) setOpen(false); }, [welcome]);
  // The way is settled after the first render (Chrome's offer can arrive late); count once it is.
  useEffect(() => {
    const t = setTimeout(() => trackLaunch(way), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const showing = open && (way !== "none" || installed);
  useEffect(() => { if (showing && !installed) track({ event: "guide", detail: "shown" }, way); }, [showing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!showing) return null;

  function later() {
    track({ event: "guide", detail: "snoozed" }, way);
    snooze();
  }
  async function onInstall() {
    track({ event: "guide", detail: "install-tap" }, way);
    if (await install()) setInstalled(true);
  }
  async function onCopy() {
    track({ event: "guide", detail: "copy-link" }, way);
    if (await copyLink()) toast.success("Enlace copiado. Pégalo en Chrome o Safari.");
    else toast.error("No pudimos copiar el enlace. Ábrelo desde el menú de la app.");
  }

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={later}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <HomeScreen />
          {installed ? (
            <View style={styles.copy}>
              <CircleCheck size={28} color={colors.primary} />
              <Text accessibilityRole="header" style={styles.title}>Listo, Rinde quedó en tu inicio</Text>
              <Text style={styles.lede}>Ábrela desde el ícono: entra a pantalla completa y con tu lista guardada.</Text>
            </View>
          ) : (
            <>
              <View style={styles.copy}>
                <Text accessibilityRole="header" style={styles.title}>Instala Rinde en tu celular</Text>
                <Text style={styles.lede}>
                  Queda en tu pantalla de inicio como cualquier app, a pantalla completa. Sin tienda de apps y casi sin ocupar espacio.{" "}
                  {HEADLINE[way as keyof typeof HEADLINE]}
                </Text>
              </View>
              {way !== "prompt" && (
                <View style={styles.card}>
                  <InstallSteps way={way} />
                  {way === "inapp" && (
                    <Pressable accessibilityRole="button" onPress={onCopy} style={({ pressed }) => [styles.copyLink, pressed && styles.pressed]}>
                      <Link size={15} color={colors.primary} />
                      <Text style={styles.copyLinkText}>Copiar enlace de Rinde</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {installed ? (
            <Button title="Seguir aquí" variant="outline" onPress={() => setOpen(false)} />
          ) : way === "prompt" ? (
            <>
              <Button title="Instalar Rinde" onPress={onInstall} />
              <Button title="Ahora no" variant="outline" onPress={later} />
            </>
          ) : (
            <Button title="Ahora no, seguir en el navegador" variant="outline" onPress={later} />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** A home screen with Rinde's icon among the person's apps: where it will live once installed. */
function HomeScreen() {
  return (
    <View style={styles.home} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <View key={i} style={styles.slot}>
          {i === 5 ? (
            <>
              <Image source={require("@/assets/icon.png")} style={styles.rinde} />
              <Text style={styles.rindeLabel}>Rinde</Text>
            </>
          ) : (
            <>
              <View style={styles.app} />
              <View style={styles.appLabel} />
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const ICON = 56;
const GAP = 22;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, justifyContent: "center", gap: spacing.xl, padding: spacing.lg, paddingTop: spacing.xl },
  home: {
    flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg, columnGap: GAP,
    alignSelf: "center", width: 4 * ICON + 3 * GAP + 2 * spacing.lg, padding: spacing.lg,
    borderRadius: radius.xl, backgroundColor: colors.secondary,
  },
  slot: { width: ICON, alignItems: "center", gap: 6 },
  app: { width: ICON, height: ICON, borderRadius: 14, backgroundColor: colors.card, opacity: 0.7 },
  appLabel: { width: 34, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  rinde: { width: ICON, height: ICON, borderRadius: 14 },
  rindeLabel: { fontSize: fontSize.tiny, fontWeight: "800", color: colors.foreground, lineHeight: 12 },
  copy: { gap: spacing.sm, alignItems: "flex-start" },
  title: { fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6, color: colors.foreground },
  lede: { fontSize: fontSize.body, lineHeight: 22, color: colors.mutedForeground },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  copyLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  copyLinkText: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  pressed: { backgroundColor: colors.muted },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
});
