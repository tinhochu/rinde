import { Image, StyleSheet, Text, View } from "react-native";
import { colors, fontSize } from "@/lib/theme";
import { stores } from "@/lib/theme";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={styles.brand}>
      <Image source={require("@/assets/logo-mark.png")} accessibilityIgnoresInvertColors style={[styles.mark, small ? styles.markSmall : styles.markLarge]} />
      <Text style={[styles.word, small ? styles.wordSmall : styles.wordLarge]}>
        Rinde<Text style={styles.dot}>.</Text>
      </Text>
    </View>
  );
}

/** Store marks as images, square; `round` ones are clipped to their circle. Others fall back to a text badge. */
const LOGOS: Record<string, { source: number; round?: boolean }> = {
  D1: { source: require("@/assets/stores/d1.png") },
  Jumbo: { source: require("@/assets/stores/jumbo.png"), round: true },
  "Éxito": { source: require("@/assets/stores/exito.png"), round: true },
};

export function StoreLogo({ store, large = false }: { store: string; large?: boolean }) {
  const logo = LOGOS[store];
  if (logo) {
    return (
      <Image
        source={logo.source}
        accessibilityLabel={store}
        accessibilityIgnoresInvertColors
        style={[styles.logoImage, large && styles.logoImageLarge, logo.round && (large ? styles.roundLarge : styles.round)]}
      />
    );
  }
  const theme = store === "Éxito" ? stores.exito : store === "Jumbo" ? stores.jumbo : stores.d1;
  return (
    <View style={[styles.store, large && styles.storeLarge, { backgroundColor: theme.bg }]}>
      <Text style={[styles.storeText, large && styles.storeTextLarge, { color: theme.fg }, "italic" in theme && theme.italic ? styles.italic : null]}>
        {theme.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { borderRadius: 12 },
  markSmall: { width: 36, height: 36 },
  markLarge: { width: 44, height: 44 },
  word: { fontWeight: "800", color: colors.primary, letterSpacing: -1 },
  wordSmall: { fontSize: 28 },
  wordLarge: { fontSize: 36 },
  dot: { color: colors.accent },
  store: {
    height: 28, minWidth: 48, borderRadius: 6, paddingHorizontal: 8,
    alignItems: "center", justifyContent: "center",
  },
  storeLarge: { height: 36, minWidth: 64 },
  logoImage: { width: 28, height: 28, borderRadius: 6 },
  logoImageLarge: { width: 36, height: 36, borderRadius: 7 },
  round: { borderRadius: 14 },
  roundLarge: { borderRadius: 18 },
  storeText: { fontSize: fontSize.subhead, fontWeight: "800", letterSpacing: -0.5 },
  storeTextLarge: { fontSize: 18 },
  italic: { fontStyle: "italic" },
});
