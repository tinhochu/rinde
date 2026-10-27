import { StyleSheet, Text, View } from "react-native";
import { ArrowRight, Scale, SearchX, TrendingDown } from "lucide-react-native";
import { AddControl } from "@/components/add-control";
import { StorePrices } from "@/components/compare-card";
import { GroceryImage } from "@/components/grocery-image";
import { FadeIn, PressScale } from "@/components/motion";
import { savings, unitPrice } from "@/lib/compare";
import { cop, quantityLabel } from "@/lib/market";
import type { ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * One real product priced at two or more stores: the cheapest price large, what it saves, and every
 * store's line. Only ever built from observed offers; see FeaturedEmpty when there are none.
 */
export function FeaturedCompare({ product, count, onCompare, onAdd, onRemove }: {
  product: ShopProduct; count: number; onCompare: () => void; onAdd: () => void; onRemove: () => void;
}) {
  const { offers, inStore = [], missing } = product.compare!;
  const best = offers[0]!;
  const saved = savings(offers);
  const perUnit = unitPrice(best);
  return (
    <FadeIn style={styles.card}>
      <View style={styles.top}>
        <GroceryImage src={product.image} alt={product.name} contain style={styles.image} />
        <View style={styles.info}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          <Text style={styles.sub}>
            {[product.pack > 0 ? (best.produce ? (best.produce.per === "kg" ? "Por kilo" : "Por unidad") : quantityLabel(product.pack, product.unit)) : "", product.brand].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{cop(best.price)}</Text>
            {perUnit && <Text style={styles.perUnit}>{perUnit}</Text>}
          </View>
          <Text style={styles.where}>Mejor precio en {best.store} · de {offers.length} tiendas</Text>
        </View>
      </View>

      {saved && (
        <FadeIn delay={220} style={styles.saving}>
          <TrendingDown size={15} color={colors.savingsInk} />
          <Text style={styles.savingText}>Ahorras {cop(saved.amount)} frente a {saved.versus}</Text>
        </FadeIn>
      )}

      <StorePrices offers={offers} inStore={inStore} missing={missing} />

      <View style={styles.actions}>
        <PressScale accessibilityRole="button" accessibilityLabel={`Comparar precios de ${product.name}`} onPress={onCompare} style={styles.compare}>
          <Scale size={16} color={colors.primary} />
          <Text style={styles.compareText}>Comparar precios</Text>
        </PressScale>
        <AddControl name={product.name} count={count} onAdd={onAdd} onRemove={onRemove} />
      </View>
    </FadeIn>
  );
}

/**
 * No product with prices from two of the chosen stores: say why and offer the way forward, never sample
 * prices. `oneStore` means the filter itself leaves nothing to compare against.
 */
export function FeaturedEmpty({ oneStore, onSearch, onAllStores }: { oneStore?: string; onSearch: () => void; onAllStores: () => void }) {
  return (
    <View style={[styles.card, styles.empty]}>
      <View style={styles.emptyIcon}>
        <SearchX size={20} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{oneStore ? `Solo ${oneStore}: no hay con qué comparar` : "Aún no hay una comparación lista para mostrarte"}</Text>
      <Text style={styles.emptyText}>
        {oneStore
          ? "Elige otra tienda en \"Comparar en\" y te mostramos la diferencia de precio."
          : "Solo mostramos precios que vimos en las tiendas. Busca un producto y te lo comparamos ahora."}
      </Text>
      <PressScale accessibilityRole="button" onPress={oneStore ? onAllStores : onSearch} style={styles.emptyGo}>
        <Text style={styles.compareText}>{oneStore ? "Comparar en todas las tiendas" : "Buscar un producto"}</Text>
        <ArrowRight size={15} color={colors.primary} />
      </PressScale>
    </View>
  );
}

/** Same footprint as FeaturedCompare while the first comparison loads. */
export function FeaturedSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.image, styles.bone]} />
        <View style={styles.info}>
          <View style={[styles.bone, styles.line, { width: "80%" }]} />
          <View style={[styles.bone, styles.line, { width: "40%" }]} />
          <View style={[styles.bone, { width: "50%", height: 28, borderRadius: 8 }]} />
        </View>
      </View>
      <View style={[styles.bone, { height: 104, borderRadius: radius.md }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.md },
  image: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.subhead, fontWeight: "700", lineHeight: 19, color: colors.foreground },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: 4 },
  price: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8, color: colors.primary, fontVariant: ["tabular-nums"] },
  perUnit: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  where: { fontSize: fontSize.caption, fontWeight: "600", color: colors.foreground },
  saving: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderRadius: radius.pill, backgroundColor: colors.savingsBg, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  savingText: { fontSize: fontSize.caption, fontWeight: "800", color: colors.savingsInk },
  actions: { flexDirection: "row", gap: spacing.sm },
  compare: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
  },
  compareText: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  empty: { alignItems: "flex-start", gap: spacing.sm, padding: spacing.lg },
  emptyIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  emptyText: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  emptyGo: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  bone: { backgroundColor: colors.muted },
  line: { height: 14, borderRadius: 6, marginBottom: 6 },
});
