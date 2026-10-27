import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, Clock3, Search, TrendingUp, X } from "lucide-react-native";
import { suggestionsFor } from "@/lib/search";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * What to search: the typed text itself, this device's recent searches, then popular ones. Only words,
 * never prices; matching is local, so typing never waits on the network.
 */
export function SearchSuggestions({ text, recent, onPick, onForget }: {
  text: string; recent: string[]; onPick: (term: string) => void; onForget: (term: string) => void;
}) {
  const typed = text.trim();
  const { recent: mine, popular } = suggestionsFor(typed, recent);
  return (
    <View style={styles.wrap}>
      {typed.length >= 2 && (
        <Row icon={<Search size={16} color={colors.primary} />} label={`Buscar “${typed}”`} strong onPress={() => onPick(typed)} />
      )}
      {mine.length > 0 && (
        <View>
          <Text style={styles.heading}>Recientes</Text>
          {mine.map(term => (
            <Row
              key={term}
              icon={<Clock3 size={16} color={colors.mutedForeground} />}
              label={term}
              onPress={() => onPick(term)}
              trailing={
                <Pressable accessibilityLabel={`Quitar ${term} de recientes`} onPress={() => onForget(term)} hitSlop={10} style={styles.forget}>
                  <X size={15} color={colors.mutedForeground} />
                </Pressable>
              }
            />
          ))}
        </View>
      )}
      {popular.length > 0 && (
        <View style={styles.popularWrap}>
          <Text style={styles.heading}>{typed ? "Sugerencias" : "Lo más buscado"}</Text>
          <View style={styles.chips}>
            {popular.map(term => (
              <Pressable key={term} onPress={() => onPick(term)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <TrendingUp size={13} color={colors.mutedForeground} />
                <Text style={styles.chipText}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Row({ icon, label, strong, trailing, onPress }: {
  icon: ReactNode; label: string; strong?: boolean; trailing?: ReactNode; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon}
      <Text numberOfLines={1} style={[styles.rowText, strong && styles.rowStrong]}>{label}</Text>
      {trailing ?? <ArrowUpRight size={15} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  heading: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 46, borderRadius: radius.md },
  rowText: { flex: 1, fontSize: fontSize.subhead + 1, color: colors.foreground },
  rowStrong: { fontWeight: "700", color: colors.primary },
  forget: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  popularWrap: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, minHeight: 36, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.muted,
  },
  chipText: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  pressed: { opacity: 0.6 },
});
