import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, ScanLine } from "lucide-react-native";
import { router } from "expo-router";
import { Pop } from "@/components/motion";
import { useRewards } from "@/components/rewards/use-rewards";
import { Button } from "@/components/ui";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * Perfil's small window into Mis aportes: three real counts from the API (points, accepted receipts,
 * badges earned), the way to scan, and the way in. Unknown counts show a dash, never a guess.
 */
export function ContributionSummary() {
  const { mine, failed } = useRewards();
  const earned = mine?.achievements.filter(a => a.earnedAt).length;
  const metrics = [
    { label: "Puntos", value: mine ? mine.points.toLocaleString("es-CO") : "—" },
    { label: "Facturas", value: mine ? String(mine.receipts.confirmed) : "—" },
    { label: "Logros", value: mine ? `${earned} de ${mine.achievements.length}` : "—" },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Ayuda a que Rinde sea mejor</Text>
        <Text style={styles.text}>Comparte los precios de tu mercado y ayuda a otras familias a ahorrar.</Text>
      </View>
      <View style={styles.metrics}>
        {metrics.map(m => (
          <View key={m.label} accessible accessibilityLabel={`${m.label}: ${m.value === "—" ? "sin cargar" : m.value}`} style={styles.metric}>
            <Pop value={m.value}><Text style={styles.metricValue}>{m.value}</Text></Pop>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      {failed ? <Text style={styles.warn}>No pudimos cargar tus aportes. Revisa tu conexión.</Text> : null}
      <Button title="Escanear factura" variant="white" icon={<ScanLine size={16} color={colors.primary} />} onPress={() => router.push("/receipt")} />
      <Pressable accessibilityRole="link" onPress={() => router.push("/contributions")} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkText}>Ver mis aportes y logros</Text>
        <ChevronRight size={16} color={colors.forestInk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.forest },
  head: { gap: 4 },
  title: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.3, color: colors.forestInk },
  text: { fontSize: fontSize.caption, lineHeight: 18, color: colors.forestSub },
  metrics: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: colors.forestLine },
  metric: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.md },
  metricValue: { fontSize: fontSize.title, fontWeight: "900", color: colors.forestInk, fontVariant: ["tabular-nums"] },
  metricLabel: { fontSize: fontSize.small, fontWeight: "600", color: colors.forestSub },
  warn: { fontSize: fontSize.caption, color: colors.forestWarn },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 40 },
  linkText: { fontSize: fontSize.body, fontWeight: "700", color: colors.forestInk },
  pressed: { opacity: 0.7 },
});
