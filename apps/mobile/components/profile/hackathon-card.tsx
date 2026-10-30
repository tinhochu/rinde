import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { X } from "lucide-react-native";
import { PressScale } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// The post announcing Rinde's hackathon entry (the landing page's banner links to it too).
const HACKATHON_POST = "https://x.com/TinHoChu/status/2116007150791139559";
const DISMISSED = "rinde-hackathon-dismissed";

/** Perfil: Rinde is in the Meta Global AI Developer Hackathon; asks for support on X. Closed once, gone for good. */
export function HackathonCard() {
  // Unknown until storage answers, so a closed card never flashes back in.
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED).then(v => setHidden(v === "1"), () => setHidden(false));
  }, []);

  if (hidden !== false) return null;

  function dismiss() {
    setHidden(true);
    AsyncStorage.setItem(DISMISSED, "1").catch(() => undefined);
  }

  return (
    // The close button sits beside the card, not inside it: a button can't hold another button on the web.
    <View>
      <PressScale accessibilityRole="link" accessibilityLabel="Apoya a Rinde en X: abre la publicación del hackathon" onPress={() => void Linking.openURL(HACKATHON_POST)} style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>Rinde está en el Meta Global AI Developer Hackathon</Text>
          <Text style={styles.text}>Si te sirve, apóyanos en X: un like o un compartido nos ayuda.</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Ver en X</Text>
        </View>
      </PressScale>
      <Pressable accessibilityRole="button" accessibilityLabel="No mostrar más" hitSlop={10} onPress={dismiss} style={styles.close}>
        <X size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  text: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  cta: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
  ctaText: { fontSize: fontSize.small, fontWeight: "800", color: colors.primary },
  close: {
    position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
});
