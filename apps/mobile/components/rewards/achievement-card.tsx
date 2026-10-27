import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Apple, CalendarCheck, Flag, Lock, ReceiptText } from "lucide-react-native";
import { useReducedMotion } from "@/components/motion";
import type { Achievement, BadgeId } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// How each badge is earned, in the person's words; the thresholds come from the API (target).
const COPY: Record<BadgeId, { icon: typeof Apple; how: (target: number) => string }> = {
  "primera-factura": { icon: ReceiptText, how: () => "Envía tu primera factura y que la aceptemos." },
  "cazador-de-frutas": { icon: Apple, how: t => `Confirma el precio de ${t} frutas o verduras en tus facturas.` },
  pionero: { icon: Flag, how: t => `Sé el primero en reportar ${t} precios que una tienda no tenía.` },
  constante: { icon: CalendarCheck, how: t => `Envía facturas en ${t} semanas distintas.` },
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

/** One badge: what it is, how to get it, how far along you are, and when you earned it. `fresh` plays a one-time unlock. */
export function AchievementCard({ achievement: a, fresh }: { achievement: Achievement; fresh?: boolean }) {
  const copy = COPY[a.id];
  const Icon = copy.icon;
  const earned = !!a.earnedAt;
  const reduced = useReducedMotion();
  const glow = useRef(new Animated.Value(fresh && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!fresh || reduced) return;
    Animated.spring(glow, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }).start();
  }, [fresh, reduced, glow]);

  return (
    <View
      accessible
      accessibilityLabel={`${a.name}. ${earned ? `Ganado el ${dateLabel(a.earnedAt!)}` : `Por ganar, llevas ${a.progress} de ${a.target}`}. ${copy.how(a.target)}`}
      style={[styles.card, earned ? styles.cardEarned : styles.cardLocked]}
    >
      <Animated.View style={[styles.icon, earned ? styles.iconEarned : styles.iconLocked, { transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
        <Icon size={20} color={earned ? colors.accentForeground : colors.mutedForeground} />
      </Animated.View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{a.name}</Text>
          {fresh ? <Text style={styles.fresh}>¡Nuevo!</Text> : null}
          {!earned ? <Lock size={13} color={colors.mutedForeground} /> : null}
        </View>
        <Text style={styles.how}>{copy.how(a.target)}</Text>
        {earned ? (
          <Text style={styles.date}>Lo ganaste el {dateLabel(a.earnedAt!)}</Text>
        ) : (
          <View style={styles.progressRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round((a.progress / a.target) * 100)}%` }]} />
            </View>
            <Text style={styles.count}>{a.progress} / {a.target}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  cardEarned: { borderColor: colors.accent, backgroundColor: colors.warnBg },
  cardLocked: { borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.card },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  iconEarned: { backgroundColor: colors.accent },
  iconLocked: { backgroundColor: colors.muted },
  body: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  fresh: { fontSize: fontSize.small, fontWeight: "800", color: colors.accent },
  how: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  date: { fontSize: fontSize.small, fontWeight: "600", color: colors.warnInk },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  count: { fontSize: fontSize.small, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
});
