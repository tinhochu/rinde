import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, Info } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { PressScale } from "@/components/motion";
import { allStores, type StoreFilter } from "@/lib/compare";
import { STORES, type Store } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * Which stores to compare. Not "where to shop": every store stays in the comparison until the person
 * narrows it. `counts` says how many shown products each store has a price for, so thin coverage shows.
 */
export function StoreFilterBar({ filter, counts, onChange }: {
  filter: StoreFilter; counts?: Partial<Record<Store, number>>; onChange: (store: Store | "all") => void;
}) {
  const all = allStores(filter);
  const uncovered = counts ? STORES.filter(s => (all || filter.includes(s)) && counts[s] === 0) : [];
  return (
    <View style={styles.wrap}>
      {/* Four equal cells, so every store is always on screen: no scrolling to find D1. */}
      <View style={styles.row}>
        <Chip active={all} label="Todas" detail={`${STORES.length} tiendas`} onPress={() => onChange("all")} />
        {STORES.map(store => (
          <Chip
            key={store}
            active={!all && filter.includes(store)}
            label={store}
            detail={counts?.[store] === undefined ? undefined : `${counts[store]} con precio`}
            logo={<StoreLogo store={store} small />}
            onPress={() => onChange(store)}
          />
        ))}
      </View>
      {uncovered.length > 0 && (
        <View style={styles.note}>
          <Info size={13} color={colors.mutedForeground} />
          <Text style={styles.noteText}>
            {uncovered.join(" y ")} {uncovered.length === 1 ? "no tiene" : "no tienen"} precio online para estos productos. No lo contamos como más barato.
          </Text>
        </View>
      )}
    </View>
  );
}

function Chip({ active, label, detail, logo, onPress }: {
  active: boolean; label: string; detail?: string; logo?: ReactNode; onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <View style={styles.chipTop}>
        {active && !logo ? <Check size={14} strokeWidth={2.6} color={colors.primary} /> : logo}
        <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </View>
      {detail && <Text numberOfLines={1} style={[styles.detail, active && styles.detailActive]}>{detail}</Text>}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: "row", gap: 6 },
  chip: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 52, paddingHorizontal: 4,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  chipTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { flexShrink: 1, fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  labelActive: { fontWeight: "800", color: colors.primary },
  detail: { fontSize: fontSize.small, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  detailActive: { color: colors.primary },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
});
