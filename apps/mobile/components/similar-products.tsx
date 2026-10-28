import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { StoreLogo } from "./brand";
import { GroceryImage } from "./grocery-image";
import { PressScale } from "./motion";
import { fetchSimilar } from "@/lib/api";
import { cop, quantityLabel, type Offer } from "@/lib/market";
import type { ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** Always per kg / L / unit, even for a 1 kg pack, so every row compares on the same measure. */
function perUnit(offer: Offer) {
  if (offer.pack <= 0) return null;
  if (offer.unit === "g") return `${cop(Math.round((offer.price * 1000) / offer.pack))}/kg`;
  if (offer.unit === "ml") return `${cop(Math.round((offer.price * 1000) / offer.pack))}/L`;
  return `${cop(Math.round(offer.price / offer.pack))}/und`;
}

/**
 * "Similares": other products Muse puts in the same kind as this one (another brand, or what another
 * store calls it, like "Leche 2.0"), cheapest per kg / L first. Each row says it's another product and
 * why Muse grouped it; the prices are the stores' own. Nothing shows when there are none.
 */
export function SimilarProducts({ listingId, onOpen }: { listingId: string; onOpen: (product: ComparedProduct) => void }) {
  const [products, setProducts] = useState<ComparedProduct[] | null>();

  useEffect(() => {
    const controller = new AbortController();
    setProducts(undefined);
    fetchSimilar(listingId, controller.signal)
      .then(r => setProducts(r.products))
      .catch(() => { if (!controller.signal.aborted) setProducts(null); });
    return () => controller.abort();
  }, [listingId]);

  if (products === undefined) {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>Similares</Text>
        <View style={styles.bone} />
      </View>
    );
  }
  if (!products?.length) return null;

  return (
    <View style={styles.section}>
      <View>
        <Text accessibilityRole="header" style={styles.title}>Similares</Text>
        <Text style={styles.note}>Otros productos del mismo tipo, del más barato por {products[0]!.unit === "g" ? "kilo" : products[0]!.unit === "ml" ? "litro" : "unidad"} al más caro.</Text>
      </View>
      <View style={styles.rows}>
        {products.map((p, i) => {
          const best = p.offers[0]!;
          return (
            <PressScale
              key={p.key}
              accessibilityRole="link"
              accessibilityLabel={`Otro producto: ${p.name}, ${cop(best.price)} en ${best.store}`}
              onPress={() => onOpen(p)}
              style={[styles.row, i > 0 && styles.divider]}
            >
              <GroceryImage src={p.image} alt={p.name} contain style={styles.image} />
              <View style={styles.info}>
                <View style={styles.chip}><Text style={styles.chipText}>Otro producto</Text></View>
                <Text numberOfLines={2} style={styles.name}>{p.name}</Text>
                <View style={styles.priceLine}>
                  <StoreLogo store={best.store} small />
                  <Text style={styles.price}>{cop(best.price)}</Text>
                  <Text style={styles.meta}>
                    {[p.pack > 0 ? quantityLabel(p.pack, p.unit) : null, perUnit(best)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {p.reason ? (
                  <View style={styles.reason}>
                    <Sparkles size={12} color={colors.mutedForeground} />
                    <Text style={styles.reasonText}>{p.reason}</Text>
                  </View>
                ) : null}
              </View>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { fontSize: fontSize.title + 1, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  note: { marginTop: 2, fontSize: fontSize.caption, lineHeight: 17, color: colors.mutedForeground },
  bone: { height: 96, borderRadius: radius.md, backgroundColor: colors.muted },
  rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.card },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  image: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 4 },
  chip: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.muted, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: fontSize.tiny, fontWeight: "800", color: colors.mutedForeground },
  name: { fontSize: fontSize.body, fontWeight: "700", lineHeight: 19, color: colors.foreground },
  priceLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  price: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  meta: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  reason: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  reasonText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
});
