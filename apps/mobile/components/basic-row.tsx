import { Pressable, StyleSheet, Text, View } from "react-native";
import { Heart } from "lucide-react-native";
import { AddControl } from "./add-control";
import { StoreLogo } from "./brand";
import { GroceryImage } from "./grocery-image";
import { FadeIn, PressScale } from "./motion";
import { savings, unitPrice } from "@/lib/compare";
import { cop, quantityLabel } from "@/lib/market";
import type { ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * A staple as one dense row, price first: best price, the store that has it, what it saves.
 * Without an observed price it says so plainly and offers to look it up.
 */
export function BasicRow({ product, index, count, favorite, onOpen, onAdd, onRemove, onFavorite, onLookup }: {
  product: ShopProduct; index: number; count: number; favorite: boolean;
  onOpen: () => void; onAdd: () => void; onRemove: () => void; onFavorite: () => void; onLookup: () => void;
}) {
  const offers = product.compare?.offers ?? (product.offer ? [product.offer] : []);
  const best = offers[0];
  const saved = savings(offers);
  const perUnit = best ? unitPrice(best) : null;
  const size = best?.produce ? (best.produce.per === "kg" ? "Por kilo" : "Por unidad") : product.pack > 0 ? quantityLabel(product.pack, product.unit) : "";

  return (
    <FadeIn index={index}>
      <PressScale accessibilityRole="button" accessibilityLabel={`Ver precios de ${product.name}`} onPress={best ? onOpen : onLookup} scaleTo={0.985} style={styles.row}>
        <View style={styles.top}>
          <GroceryImage src={product.image} alt="" contain={!!best} style={styles.image} />
          <View style={styles.info}>
            <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
            <Text numberOfLines={1} style={styles.sub}>{[size, perUnit].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.side}>
            {best ? (
              <>
                <Text style={styles.price}>{cop(best.price)}</Text>
                <View style={styles.store}>
                  <StoreLogo store={best.store} small />
                  <Text style={styles.storeText}>{best.store}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.unpriced}>Precio aún no{"\n"}disponible</Text>
            )}
          </View>
        </View>
        <View style={styles.bottom}>
          {best ? (
            saved ? (
              <Text style={styles.saving}>Ahorras {cop(saved.amount)} vs {saved.versus}</Text>
            ) : (
              <Text style={styles.single}>{offers.length > 1 ? `Mismo precio en ${offers.length} tiendas` : `Solo con precio en ${best.store}`}</Text>
            )
          ) : (
            <Text style={styles.single}>Toca para buscar su precio hoy</Text>
          )}
          <Pressable
            accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
            onPress={onFavorite}
            hitSlop={8}
            style={styles.heart}
          >
            <Heart size={16} color={favorite ? colors.primary : colors.mutedForeground} fill={favorite ? colors.primary : "transparent"} />
          </Pressable>
          <AddControl compact name={product.name} count={count} onAdd={onAdd} onRemove={onRemove} />
        </View>
      </PressScale>
    </FadeIn>
  );
}

export function BasicRowSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.row, styles.top]}>
      <View style={[styles.image, styles.bone]} />
      <View style={styles.info}>
        <View style={[styles.bone, styles.line, { width: "85%" }]} />
        <View style={[styles.bone, styles.line, { width: "45%" }]} />
      </View>
      <View style={[styles.bone, { width: 64, height: 22, borderRadius: 6 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // Under the name, not under the photo: the photo column stays clean.
  bottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: 56 + spacing.md },
  image: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 3 },
  name: { fontSize: fontSize.body, fontWeight: "700", lineHeight: 17, color: colors.foreground },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  saving: { flex: 1, fontSize: fontSize.caption, fontWeight: "800", color: colors.savingsInk },
  single: { flex: 1, fontSize: fontSize.caption, color: colors.mutedForeground },
  side: { alignItems: "flex-end", gap: 4 },
  price: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4, color: colors.primary, fontVariant: ["tabular-nums"] },
  store: { flexDirection: "row", alignItems: "center", gap: 4 },
  storeText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.foreground },
  unpriced: { fontSize: fontSize.caption, fontWeight: "600", lineHeight: 15, textAlign: "right", color: colors.mutedForeground },
  heart: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  bone: { backgroundColor: colors.muted },
  line: { height: 13, borderRadius: 6 },
});
