import { StyleSheet, Text, View } from "react-native";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { STORE_NAME, type RetailerSlug, type VerifyProgress } from "@/lib/planner";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// Before the first event we don't know which stores the plan uses; D1, Jumbo and Carulla are always enabled.
const DEFAULT_STORES: RetailerSlug[] = ["d1", "jumbo", "carulla"];

/** One row per store: live re-check status streamed from the planner ("Verificando D1… 9/9 ✓"). */
export function VerifyProgressRows({ progress, stores, compact = false }: { progress: VerifyProgress[]; stores?: RetailerSlug[]; compact?: boolean }) {
  return (
    <View style={[styles.list, compact && styles.listCompact]}>
      {(stores ?? (progress.length ? progress.map(p => p.store) : DEFAULT_STORES)).map(store => {
        const p = progress.find(x => x.store === store);
        const name = STORE_NAME[store];
        // A store's check is announced at 0/N when it starts, and reported once it ends.
        const checking = !!p && !p.failed && p.checked < p.total;
        const text = !p
          ? "Buscando precios y armando tu ruta…"
          : p.failed
            ? `${name} no respondió: usamos su precio de catálogo más reciente`
            : checking
              ? `Verificando ${name}… ${p.total} ${p.total === 1 ? "precio" : "precios"} en vivo`
              : `Verificando ${name}… ${p.checked}/${p.total} ✓${p.changed ? ` · ${p.changed} ${p.changed === 1 ? "precio cambió" : "precios cambiaron"}` : ""}`;
        return (
          <View key={store} style={[styles.row, compact && styles.rowCompact]}>
            <StoreLogo store={name} />
            <Text style={styles.text}>{text}</Text>
            {!p || checking ? <LoaderCircle size={17} color={colors.primary} /> : p.failed ? <AlertCircle size={17} color={colors.warnInk} /> : <CheckCircle2 size={17} color={colors.primary} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: "100%", gap: spacing.md },
  listCompact: { gap: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.lg,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, padding: spacing.lg,
  },
  rowCompact: { padding: spacing.md, gap: spacing.md },
  text: { flex: 1, fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
});
