import { StyleSheet, Text, View } from "react-native";
import { CircleCheck, CircleX, Clock3 } from "lucide-react-native";
import type { ReceiptSummary } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const day = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

/**
 * The person's last receipts and what happened to each. "Aceptada" means its prices passed the
 * checks and count; it is not a claim that a store verified them.
 */
export function ReceiptHistory({ receipts }: { receipts: ReceiptSummary[] }) {
  return (
    <View style={styles.list}>
      {receipts.map((r, i) => {
        const status = STATUS[r.status];
        const Icon = status.icon;
        return (
          <View key={r.id} style={[styles.row, i < receipts.length - 1 && styles.divider]}>
            <Icon size={18} color={status.color} />
            <View style={styles.body}>
              <Text style={styles.title}>{r.store} · {day(r.purchasedAt)}</Text>
              <Text style={styles.detail}>{detail(r)}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const STATUS = {
  confirmed: { label: "Aceptada", icon: CircleCheck, color: colors.primary, bg: colors.secondary },
  draft: { label: "Sin enviar", icon: Clock3, color: colors.warnInk, bg: colors.warnSurface },
  revoked: { label: "Anulada", icon: CircleX, color: colors.destructive, bg: colors.muted },
} as const;

function detail(r: ReceiptSummary) {
  if (r.status === "draft") return "La leímos, pero no confirmaste sus precios. No suma puntos.";
  if (r.status === "revoked") return `${r.reason ?? "La anulamos"}. Sus puntos se descontaron.`;
  const prices = `${r.acceptedLines} ${r.acceptedLines === 1 ? "precio aceptado" : "precios aceptados"}`;
  return r.points ? `${prices} · +${r.points.toLocaleString("es-CO")} puntos` : prices;
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  detail: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: fontSize.small, fontWeight: "800" },
});
