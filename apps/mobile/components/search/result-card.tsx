import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Heart } from "lucide-react-native";
import { AddControl } from "@/components/add-control";
import { StoreLogo } from "@/components/brand";
import { StorePrices } from "@/components/compare-card";
import { GroceryImage } from "@/components/grocery-image";
import { FadeIn, PressScale } from "@/components/motion";
import { unitPrice } from "@/lib/compare";
import { cop, quantityLabel } from "@/lib/market";
import type { ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * One product in the results, short enough to scan many: lowest price and where, how many stores,
 * the widest gap. "Comparar precios" opens every store's line in place, with links and times kept.
 */
export function ResultCard({ product, index, count, favorite, expanded, onToggle, onOpen, onAdd, onRemove, onFavorite }: {
  product: ComparedProduct; index: number; count: number; favorite: boolean; expanded: boolean;
  onToggle: () => void; onOpen: () => void; onAdd: () => void; onRemove: () => void; onFavorite: () => void;
}) {
  const best = product.offers[0]!;
  const stores = product.offers.length;
  const cheapest = product.offers.filter(o => o.price === best.price).map(o => o.store);
  const size = best.produce ? (best.produce.per === "kg" ? "Por kilo" : "Por unidad") : product.pack > 0 ? quantityLabel(product.pack, product.unit) : "Tamaño sin informar";
  const perUnit = unitPrice(best);

  return (
    <FadeIn index={index} style={[styles.card, expanded && styles.cardOpen]}>
      <View style={styles.top}>
        <PressScale accessibilityRole="link" accessibilityLabel={`Ver detalle de ${product.name}`} onPress={onOpen} scaleTo={0.95}>
          <GroceryImage src={product.image} alt={product.name} contain style={styles.image} />
        </PressScale>
        <View style={styles.info}>
          {product.similar && (
            <View style={styles.similar} accessibilityLabel="Similar: otra marca, no la que buscaste">
              <Text style={styles.similarText}>Similar</Text>
            </View>
          )}
          <Pressable accessibilityRole="link" onPress={onOpen}>
            <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.sub}>
            {[product.brand, size].filter(Boolean).join(" · ")}
          </Text>
          <Text style={styles.stores}>
            {stores === 1 ? "1 supermercado" : `${stores} supermercados`}
            {product.missing.length > 0 ? ` · no está en ${product.missing.join(" ni ")}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
          onPress={onFavorite}
          hitSlop={8}
          style={styles.heart}
        >
          <Heart size={17} color={favorite ? colors.primary : colors.mutedForeground} fill={favorite ? colors.primary : "transparent"} />
        </Pressable>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceBlock}>
          <View style={styles.fromRow}>
            <Text style={styles.from}>{stores > 1 ? "Desde" : "Precio"}</Text>
            <Text style={styles.price}>{cop(best.price)}</Text>
            {best.source === "receipt" && <Text style={styles.tag}>factura</Text>}
          </View>
          <View style={styles.whereRow}>
            {cheapest.map(s => <StoreLogo key={s} store={s} small />)}
            <Text style={styles.where}>{cheapest.join(" y ")}{perUnit ? ` · ${perUnit}` : ""}</Text>
          </View>
        </View>
        {product.spread > 0 ? (
          <View style={styles.spread}>
            <Text style={styles.spreadLabel}>Hasta</Text>
            <Text style={styles.spreadValue}>{cop(product.spread)}</Text>
            <Text style={styles.spreadLabel}>de diferencia</Text>
          </View>
        ) : stores > 1 ? (
          <Text style={styles.same}>Mismo precio{"\n"}en {stores} tiendas</Text>
        ) : null}
      </View>

      {expanded && (
        <FadeIn style={styles.detail}>
          <StorePrices offers={product.offers} inStore={product.inStore} missing={product.missing} />
          <Pressable accessibilityRole="link" onPress={onOpen} hitSlop={6} style={styles.more}>
            <Text style={styles.moreText}>Ver detalle e historial</Text>
            <ChevronRight size={15} color={colors.primary} />
          </Pressable>
        </FadeIn>
      )}

      <View style={styles.actions}>
        <AddControl name={product.name} count={count} onAdd={onAdd} onRemove={onRemove} />
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? "Ocultar" : "Comparar"} precios de ${product.name}`}
          onPress={onToggle}
          style={[styles.compare, expanded && styles.compareOpen]}
        >
          <Text style={styles.compareText}>{expanded ? "Ocultar precios" : "Comparar precios"}</Text>
          <View style={expanded && styles.chevronOpen}>
            <ChevronDown size={16} color={colors.primary} />
          </View>
        </PressScale>
      </View>
    </FadeIn>
  );
}

/** Same footprint as a closed ResultCard. */
export function ResultCardSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.image, styles.bone]} />
        <View style={styles.info}>
          <View style={[styles.bone, styles.line, { width: "85%" }]} />
          <View style={[styles.bone, styles.line, { width: "50%" }]} />
          <View style={[styles.bone, styles.line, { width: "35%" }]} />
        </View>
      </View>
      <View style={[styles.bone, { width: "45%", height: 26, borderRadius: 8 }]} />
      <View style={[styles.bone, { height: 44, borderRadius: radius.pill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  cardOpen: { borderColor: colors.primary },
  top: { flexDirection: "row", gap: spacing.md },
  image: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 2 },
  similar: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.muted, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  similarText: { fontSize: fontSize.tiny, fontWeight: "800", color: colors.mutedForeground },
  name: { fontSize: fontSize.subhead, fontWeight: "700", lineHeight: 19, color: colors.foreground },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  stores: { fontSize: fontSize.caption, fontWeight: "600", color: colors.foreground },
  heart: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: -4, marginRight: -4 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  priceBlock: { flexShrink: 1, gap: 3 },
  fromRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  from: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  price: { fontSize: 24, fontWeight: "800", letterSpacing: -0.7, color: colors.primary, fontVariant: ["tabular-nums"] },
  tag: { fontSize: fontSize.small, fontWeight: "700", color: colors.mutedForeground },
  whereRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  where: { flexShrink: 1, fontSize: fontSize.caption, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
  spread: { alignItems: "flex-end", borderRadius: radius.md, backgroundColor: colors.savingsBg, paddingHorizontal: spacing.md, paddingVertical: 6 },
  spreadLabel: { fontSize: fontSize.small, fontWeight: "600", color: colors.savingsInk },
  spreadValue: { fontSize: fontSize.title, fontWeight: "800", color: colors.savingsInk, fontVariant: ["tabular-nums"] },
  same: { fontSize: fontSize.caption, lineHeight: 15, textAlign: "right", color: colors.mutedForeground },
  detail: { gap: spacing.sm },
  more: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", minHeight: 32 },
  moreText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.sm },
  compare: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 44,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
  },
  compareOpen: { backgroundColor: colors.secondary },
  compareText: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  bone: { backgroundColor: colors.muted },
  line: { height: 13, borderRadius: 6, marginBottom: 6 },
});
