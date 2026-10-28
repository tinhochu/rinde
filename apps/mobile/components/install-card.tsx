import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Share, SquarePlus, X } from "lucide-react-native";
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
    if (way === "ios") return setSteps(true);
    if (await install()) toast.success("Listo: Rinde quedó en tu pantalla de inicio.");
  }

  return (
    <>
      <PressScale accessibilityRole="button" accessibilityLabel="Instalar Rinde en este celular" onPress={onInstall} style={styles.card}>
        <Image source={require("@/assets/icon.png")} style={styles.icon} accessibilityIgnoresInvertColors />
        <View style={styles.copy}>
          <Text style={styles.title}>{moved ? "Rinde ahora vive en esta dirección" : "Instala Rinde en tu celular"}</Text>
          <Text style={styles.text}>
            {moved ? "Tus datos vienen contigo. Instálala de nuevo desde aquí." : "Ábrela desde tu pantalla de inicio, a pantalla completa."}
          </Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{way === "ios" ? "Ver cómo" : "Instalar"}</Text>
        </View>
        {dismissible && (
          <Pressable accessibilityRole="button" accessibilityLabel="No mostrar más" hitSlop={10} onPress={dismiss} style={styles.close}>
            <X size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </PressScale>

      <Sheet visible={steps} onClose={() => setSteps(false)}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>Agrega Rinde a tu inicio</Text>
          <Text style={styles.sheetLede}>En Safari son tres toques. Después la abres como cualquier app.</Text>
          <Step n={1} icon={<Share size={18} color={colors.primary} />}>
            Toca <Text style={styles.strong}>Compartir</Text> en la barra de Safari. Si no lo ves, toca primero <Text style={styles.strong}>···</Text>.
          </Step>
          <Step n={2} icon={<SquarePlus size={18} color={colors.primary} />}>
            Baja en el menú y elige <Text style={styles.strong}>Agregar a inicio</Text>.
          </Step>
          <Step n={3} icon={<Text style={styles.add}>Agregar</Text>}>
            Confirma con <Text style={styles.strong}>Agregar</Text>. Rinde queda junto a tus apps.
          </Step>
          <Button title="Entendido" onPress={() => setSteps(false)} />
        </View>
      </Sheet>
    </>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
      <Text style={styles.stepText}>{children}</Text>
      <View style={styles.stepIcon}>{icon}</View>
    </View>
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
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  stepNumberText: { fontSize: fontSize.small, fontWeight: "800", color: colors.secondaryForeground },
  stepText: { flex: 1, fontSize: fontSize.body, lineHeight: 21, color: colors.foreground },
  stepIcon: { width: 64, alignItems: "flex-end" },
  strong: { fontWeight: "800" },
  add: { fontSize: fontSize.small, fontWeight: "700", color: "#0A84FF" },
});
