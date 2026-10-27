import { Platform, StyleSheet, Text, View } from "react-native";
import { Search } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { PressScale } from "@/components/motion";
import { STORES } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * The home screen's main action. It looks like a field but opens the search screen, where typing,
 * recent searches and results all live; the logos say what every search is compared across.
 */
export function SearchEntry({ onPress }: { onPress: () => void }) {
  return (
    <PressScale accessibilityRole="search" accessibilityLabel="Buscar y comparar productos en Éxito, Jumbo y D1" onPress={onPress} scaleTo={0.985} style={styles.field}>
      <Search size={20} color={colors.primary} />
      <Text numberOfLines={1} style={styles.placeholder}>Busca leche, arroz, huevos...</Text>
      <View style={styles.logos}>
        {STORES.map((s, i) => (
          <View key={s} style={[styles.logo, i > 0 && styles.logoOverlap]}>
            <StoreLogo store={s} small />
          </View>
        ))}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 56, paddingLeft: spacing.lg, paddingRight: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    ...(Platform.OS === "web" ? { boxShadow: "0 2px 10px rgba(0,0,0,0.06)" } : { elevation: 1 }),
  },
  placeholder: { flex: 1, fontSize: fontSize.title - 1, color: colors.mutedForeground },
  logos: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  logo: { borderRadius: 12, borderWidth: 2, borderColor: colors.card },
  logoOverlap: { marginLeft: -7 },
});
