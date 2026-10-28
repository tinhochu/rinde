import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { InstallSteps } from "@/components/install-steps";
import { PressScale } from "@/components/motion";
import { Button, Sheet } from "@/components/ui";
import { useInstall } from "@/lib/install";
import { toast } from "@/lib/toast";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * "Instala Rinde": in a browser that can install, one tap; on an iPhone, the steps in Safari's Share
 * menu. Nothing once installed or in the native app. On Home it can be closed for good; Perfil keeps it.
 * Right after Rinde moved from its old address, it says so (once) and asks to install it again.
 */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const { way, install, dismissed, dismiss, moved } = useInstall();
  const [steps, setSteps] = useState(false);

  // Where this browser can't install, the move is still worth saying.
  useEffect(() => {
    if (moved && dismissible && way === "none") toast.success("Rinde ahora vive en esta dirección. Tus datos vienen contigo.");
  }, [moved, dismissible, way]);

  if (way === "none" || (dismissible && dismissed && !moved)) return null;

  async function onInstall() {
    if (way !== "prompt") return setSteps(true);
    if (await install()) toast.success("Listo: Rinde quedó en tu pantalla de inicio.");
  }

  return (
    <>
      {/* The close button sits beside the card, not inside it: a button can't hold another button on the web. */}
      <View>
        <PressScale accessibilityRole="button" accessibilityLabel="Instalar Rinde en este celular" onPress={onInstall} style={styles.card}>
          <Image source={require("@/assets/icon.png")} style={styles.icon} accessibilityIgnoresInvertColors />
          <View style={styles.copy}>
            <Text style={styles.title}>{moved ? "Rinde ahora vive en esta dirección" : "Instala Rinde en tu celular"}</Text>
            <Text style={styles.text}>
              {moved ? "Tus datos vienen contigo. Instálala de nuevo desde aquí." : "Ábrela desde tu pantalla de inicio, a pantalla completa."}
            </Text>
          </View>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{way === "prompt" ? "Instalar" : "Ver cómo"}</Text>
          </View>
        </PressScale>
        {dismissible && (
          <Pressable accessibilityRole="button" accessibilityLabel="No mostrar más" hitSlop={10} onPress={dismiss} style={styles.close}>
            <X size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <Sheet visible={steps} onClose={() => setSteps(false)}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>Agrega Rinde a tu inicio</Text>
          <Text style={styles.sheetLede}>
            {way === "inapp" ? "Este navegador no puede instalar; ábrela en Chrome o Safari." : "Son tres toques. Después la abres como cualquier app."}
          </Text>
          <InstallSteps way={way} />
          <Button title="Entendido" onPress={() => setSteps(false)} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.secondaryBorder, backgroundColor: colors.secondary,
  },
  icon: { width: 44, height: 44, borderRadius: 11 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  text: { fontSize: fontSize.caption, lineHeight: 16, color: colors.secondaryForeground },
  cta: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  ctaText: { fontSize: fontSize.small, fontWeight: "800", color: colors.primaryForeground },
  close: {
    position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  sheet: { gap: spacing.md, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  sheetLede: { fontSize: fontSize.body, color: colors.mutedForeground },
});
