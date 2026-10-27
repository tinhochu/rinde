import { Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { Pop, PressScale } from "./motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * Add to the carrito, then a stepper once it's there. `compact` is a round + for dense rows;
 * the full size spells the action out.
 */
export function AddControl({ name, count, onAdd, onRemove, compact = false }: {
  name: string; count: number; onAdd: () => void; onRemove: () => void; compact?: boolean;
}) {
  if (count === 0) {
    return (
      <PressScale accessibilityRole="button" accessibilityLabel={`Agregar ${name} a mi carrito`} onPress={onAdd} hitSlop={6} style={compact ? styles.addRound : styles.add}>
        <Plus size={compact ? 18 : 16} strokeWidth={2.6} color="#FFFFFF" />
        {!compact && <Text style={styles.addText}>Agregar</Text>}
      </PressScale>
    );
  }
  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <Pressable accessibilityLabel={`Quitar una cantidad de ${name}`} onPress={onRemove} hitSlop={4} style={styles.step}>
        <Minus size={15} strokeWidth={2.4} color={colors.primary} />
      </Pressable>
      <Pop value={count}>
        <Text accessibilityLiveRegion="polite" style={styles.count}>{count}</Text>
      </Pop>
      <Pressable accessibilityLabel={`Agregar otra cantidad de ${name}`} onPress={onAdd} hitSlop={4} style={styles.step}>
        <Plus size={15} strokeWidth={2.4} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary,
  },
  addText: { fontSize: fontSize.body, fontWeight: "800", color: "#FFFFFF" },
  addRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: 4,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.secondary,
  },
  stepperCompact: { minHeight: 36 },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  count: { minWidth: 18, textAlign: "center", fontSize: fontSize.subhead, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
});
