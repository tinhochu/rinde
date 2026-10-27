import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, Bookmark, X } from "lucide-react-native";
import { useReducedMotion } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const PHASES = ["Tu mercado", "Presupuesto", "Dónde rinde"];

/**
 * The planner's only chrome: back, title, saved plans, exit, and three labeled phases. The checking
 * state belongs to the last phase, so `phase` is 0–2 and `busy` fills the bar while prices come in.
 */
export function PlanHeader({ phase, reachable, busy, onBack, onExit, onSaved, onPhase }: {
  phase: number; reachable: number; busy: boolean;
  onBack: () => void; onExit: () => void; onSaved: () => void; onPhase: (phase: number) => void;
}) {
  const reduced = useReducedMotion();
  const fill = useRef(new Animated.Value(phase)).current;
  useEffect(() => {
    const to = busy ? phase + 0.5 : phase + 1;
    if (reduced) { fill.setValue(to); return; }
    const anim = Animated.timing(fill, { toValue: to, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [phase, busy, reduced, fill]);
  const width = fill.interpolate({ inputRange: [0, PHASES.length], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={8} onPress={onBack} style={styles.icon}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Mi plan de ahorro</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Planes guardados" hitSlop={8} onPress={onSaved} style={styles.icon}>
          <Bookmark size={19} color={colors.mutedForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Salir del plan. Tu lista queda guardada." hitSlop={8} onPress={onExit} style={styles.icon}>
          <X size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={`Paso ${phase + 1} de ${PHASES.length}: ${PHASES[phase]}`} style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
      <View style={styles.labels}>
        {PHASES.map((label, i) => {
          const can = i <= reachable && i !== phase && !busy;
          return (
            <Pressable key={label} disabled={!can} onPress={() => onPhase(i)} hitSlop={6} style={styles.label}>
              <Text style={[styles.labelText, { textAlign: i === 0 ? "left" : i === PHASES.length - 1 ? "right" : "center" }, i < phase && styles.labelDone, i === phase && styles.labelActive, i > reachable && styles.labelLocked]}>
                {i + 1}. {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    paddingTop: Platform.OS === "web" ? spacing.md : 0,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  label: { flex: 1 },
  labelText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  labelDone: { color: colors.primary },
  labelActive: { fontWeight: "800", color: colors.foreground },
  labelLocked: { opacity: 0.55 },
});
