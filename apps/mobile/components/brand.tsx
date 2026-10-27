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

export function StoreLogo({ store, large = false }: { store: string; large?: boolean }) {
  if (store === "D1") {
    return (
      <Image
        source={require("@/assets/stores/d1.png")}
        accessibilityLabel="D1"
        accessibilityIgnoresInvertColors
        style={[styles.logoImage, large && styles.logoImageLarge]}
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
  storeText: { fontSize: fontSize.subhead, fontWeight: "800", letterSpacing: -0.5 },
  storeTextLarge: { fontSize: 18 },
  italic: { fontStyle: "italic" },
});
