import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RotateCw, SearchCheck } from "lucide-react-native";
import { StoreLogo } from "./brand";
import { PressScale } from "./motion";
import { checkStores, type StoreCheck } from "@/lib/api";
import type { Offer, Store } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

type Row = { store: Store; state: "loading" } | Exclude<StoreCheck, { state: "price" }>;

/**
 * "Buscar en todas las tiendas": asks each store still without a price, live, by barcode and then by
 * name with Muse's judgment. Prices found go up into the store list (`onFound`); a store that answered
 * says "No lo vende", and one that didn't is never read as not selling it.
 */
export function CheckStores({ listingId, lacking, onFound }: {
  listingId: string; lacking: Store[];
  /** Prices found, and every store that answered (priced or "No lo vende"). */
  onFound: (found: { offer: Offer; reason?: string }[], answered: Store[]) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { setRows(null); }, [listingId]);

  if (lacking.length === 0 && !rows?.length) return null;

  function run(stores: Store[]) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setRows(prev => [
      ...(prev ?? []).filter(r => !stores.includes(r.store)),
      ...stores.map((store): Row => ({ store, state: "loading" })),
    ]);
    checkStores(listingId, current.signal)
      .then(({ stores: checks }) => {
        const asked = checks.filter(c => stores.includes(c.store));
        const found = asked.flatMap(c => (c.state === "price" ? [{ offer: c.offer, ...(c.reason ? { reason: c.reason } : {}) }] : []));
        setRows(prev => (prev ?? []).flatMap((r): Row[] => {
          if (!stores.includes(r.store)) return [r];
          const check = asked.find(c => c.store === r.store);
          if (!check) return [{ store: r.store, state: "unchecked" }];
          return check.state === "price" ? [] : [check];
        }));
        onFound(found, asked.filter(c => c.state !== "unchecked").map(c => c.store));
      })
      .catch(() => {
        if (current.signal.aborted) return;
        setRows(prev => (prev ?? []).map(r => (stores.includes(r.store) ? { store: r.store, state: "unchecked" } : r)));
      });
  }

  if (!rows) {
    return (
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`Buscar en todas las tiendas: ${lacking.join(", ")}`}
        onPress={() => run(lacking)}
        style={styles.button}
      >
        <SearchCheck size={17} color={colors.primary} />
        <View style={styles.buttonText}>
          <Text style={styles.buttonTitle}>Buscar en todas las tiendas</Text>
          <Text style={styles.buttonSub}>Revisamos ahora {lacking.join(", ")}</Text>
        </View>
      </PressScale>
    );
  }
  if (!rows.length) return null;

  return (
    <View style={styles.rows} accessibilityLiveRegion="polite">
      {rows.map((row, i) => (
        <View key={row.store} style={[styles.row, i > 0 && styles.divider]}>
          <View style={styles.logoSlot}><StoreLogo store={row.store} /></View>
          {row.state === "loading" ? (
            <>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.status}>Buscando en {row.store}…</Text>
            </>
          ) : row.state === "not-sold" ? (
            <View style={styles.statusBlock}>
              <Text style={styles.status}>No lo vende</Text>
              {row.reason ? <Text style={styles.reason}>{row.reason}</Text> : null}
            </View>
          ) : (
            <>
              <Text style={[styles.status, styles.flex]}>No pudimos revisar</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reintentar ${row.store}`}
                onPress={() => run([row.store])}
                hitSlop={8}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <RotateCw size={13} color={colors.primary} />
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card,
  },
  buttonText: { flex: 1, gap: 1 },
  buttonTitle: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  buttonSub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  logoSlot: { width: 64 },
  statusBlock: { flex: 1, gap: 2 },
  status: { fontSize: fontSize.body, fontWeight: "600", color: colors.mutedForeground },
  reason: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  flex: { flex: 1 },
  retry: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  retryText: { fontSize: fontSize.caption, fontWeight: "800", color: colors.primary },
  pressed: { backgroundColor: colors.muted },
});
