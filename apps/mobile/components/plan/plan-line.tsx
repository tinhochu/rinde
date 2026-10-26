import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeftRight, Clock3, ExternalLink, ShieldCheck } from "lucide-react-native";
import { cop } from "@/lib/market";
import { packLabel, provenance, type PlanLine } from "@/lib/planner";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export function PlanLineRow({ line, now }: { line: PlanLine; now: number }) {
  const c = line.candidate;
  const live = c.priceStatus === "live";
  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{c.name}</Text>
        <Text style={styles.total} selectable>{cop(line.lineTotal)}</Text>
      </View>
      <Text style={styles.sub}>
        {line.packs} × {packLabel(c) || "empaque"} · {cop(c.price)} c/u · para “{line.label}”
      </Text>
      <View style={[styles.reason, line.isSubstitute && styles.reasonSwap]}>
        {line.isSubstitute && <ArrowLeftRight size={13} color={colors.primary} />}
        <Text style={styles.reasonText}>{line.reason}</Text>
      </View>
      <View style={styles.metaRow}>
        {live ? <ShieldCheck size={11} color={colors.primary} /> : <Clock3 size={11} color={colors.mutedForeground} />}
        <Text style={[styles.meta, live && styles.metaLive]}>{provenance(c, now)}</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(c.url)} style={styles.linkRow}>
        <Text style={styles.link}>Ver en la tienda</Text>
        <ExternalLink size={11} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, gap: 6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20 },
  total: { fontSize: fontSize.title, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  reason: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.sm, backgroundColor: colors.background, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  reasonSwap: { backgroundColor: colors.secondary },
  reasonText: { flexShrink: 1, fontSize: fontSize.caption, lineHeight: 18, color: colors.primary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { flex: 1, fontSize: fontSize.small, color: colors.mutedForeground },
  metaLive: { color: colors.primary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  link: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
});
