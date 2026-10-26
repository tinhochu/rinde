import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ExternalLink, Heart, Minus, Plus } from "lucide-react-native";
import { StoreLogo } from "./brand";
import { GroceryImage } from "./grocery-image";
import { cop, quantityLabel, type Offer } from "@/lib/market";
import { observedLabel, type ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** One product, every store that sells it, cheapest first. Adding uses the cheapest store's offer. */
export function CompareCard({ product, count, favorite, onAdd, onRemove, onFavorite, onOpen }: {
  product: ComparedProduct; count: number; favorite: boolean;
  onAdd: () => void; onRemove: () => void; onFavorite: () => void; onOpen: (offer: Offer) => void;
}) {
  const [best] = product.offers;
  const many = product.offers.length > 1;
  const cheapest = product.offers.filter((o) => o.price === best!.price).map((o) => o.store);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={`Ver ${product.name}`} onPress={() => onOpen(best!)}>
          <GroceryImage src={product.image} alt={product.name} contain style={styles.image} />
        </Pressable>
        <View style={styles.info}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          <Text style={styles.sub}>
            {product.pack > 0 ? quantityLabel(product.pack, product.unit) : "Tamaño sin informar"}
            {product.brand ? ` · ${product.brand}` : ""}
          </Text>
          {many ? (
            <Text style={styles.verdict}>
              {product.spread === 0
                ? `Mismo precio en ${cheapest.join(" y ")}`
                : `Más barato en ${cheapest.join(" y ")}: ${cop(product.spread)} menos que en ${product.offers.at(-1)!.store}`}
            </Text>
          ) : (
            <Text style={styles.single}>Solo lo encontramos en {best!.store}</Text>
          )}
        </View>
        <Pressable
          accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
          onPress={onFavorite}
          style={styles.heart}
        >
          <Heart size={16} color={favorite ? colors.primary : colors.foreground} fill={favorite ? colors.primary : "transparent"} />
        </Pressable>
      </View>

      <View style={styles.rows}>
        {product.offers.map((offer, i) => (
          <Pressable
            key={offer.id}
            accessibilityRole="link"
            accessibilityLabel={`${offer.store}: ${cop(offer.price)}. Ver en la tienda`}
            onPress={() => Linking.openURL(offer.url)}
            style={[styles.row, i === 0 && many && styles.rowBest]}
          >
            <StoreLogo store={offer.store} />
            <View style={styles.rowBody}>
              <Text style={[styles.price, i > 0 && styles.priceOther]}>{cop(offer.price)}</Text>
              <Text style={styles.meta}>
                {offer.pack > 0 && offer.pack !== product.pack ? `${quantityLabel(offer.pack, offer.unit)} · ` : ""}
                {observedLabel(offer)}
              </Text>
            </View>
            {i === 0 && many && product.spread > 0 ? (
              <Text style={styles.bestTag}>Más barato</Text>
            ) : i > 0 && offer.price === best!.price ? (
              <Text style={styles.same}>Mismo precio</Text>
            ) : i > 0 ? (
              <Text style={styles.diff}>+{cop(offer.price - best!.price)}</Text>
            ) : null}
            <ExternalLink size={13} color={colors.mutedForeground} />
          </Pressable>
        ))}
        {product.missing.length > 0 && (
          <Text style={styles.missing}>No está en {product.missing.join(" ni ")}, según su catálogo online.</Text>
        )}
      </View>

      {count === 0 ? (
        <Pressable accessibilityLabel={`Agregar ${product.name} a mi canasta`} onPress={onAdd} style={styles.add}>
          <Plus size={16} strokeWidth={2.5} color="#FFFFFF" />
          <Text style={styles.addText}>Agregar a mi canasta</Text>
        </Pressable>
      ) : (
        <View style={styles.stepper}>
          <Pressable accessibilityLabel={`Quitar una cantidad de ${product.name}`} onPress={onRemove} style={styles.stepperButton}>
            <Minus size={16} color={colors.primary} />
          </Pressable>
          <Text style={styles.stepperCount}>{count} en tu canasta</Text>
          <Pressable accessibilityLabel={`Agregar otra cantidad de ${product.name}`} onPress={onAdd} style={styles.stepperButton}>
            <Plus size={16} color={colors.primary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Placeholder with the CompareCard footprint, shown while a search is in flight. */
export function CompareCardSkeleton() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced) return;
      const step = (toValue: number) => Animated.timing(pulse, { toValue, duration: 700, useNativeDriver: Platform.OS !== "web" });
      loop = Animated.loop(Animated.sequence([step(0.45), step(1)]));
      loop.start();
    }).catch(() => undefined);
    return () => loop?.stop();
  }, [pulse]);
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.card, { opacity: pulse }]}>
      <View style={styles.top}>
        <View style={[styles.image, styles.boneBlock]} />
        <View style={styles.info}>
          <View style={[styles.bone, { width: "85%" }]} />
          <View style={[styles.bone, { width: "40%" }]} />
          <View style={[styles.bone, { width: "65%" }]} />
        </View>
      </View>
      <View style={styles.rows}>
        {[0, 1].map(i => <View key={i} style={[styles.bone, { height: 44, borderRadius: radius.md }]} />)}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.md },
  image: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 4 },
  name: { fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20, color: colors.foreground },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  verdict: { fontSize: fontSize.caption, lineHeight: 17, fontWeight: "600", color: colors.primary },
  single: { fontSize: fontSize.caption, color: colors.mutedForeground },
  heart: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  rows: { gap: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowBest: { borderColor: colors.primary, backgroundColor: colors.secondary },
  rowBody: { flex: 1, gap: 1 },
  price: { fontSize: fontSize.title, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  priceOther: { color: colors.foreground, fontWeight: "700" },
  meta: { fontSize: fontSize.tiny, color: colors.mutedForeground },
  bestTag: { fontSize: fontSize.small, fontWeight: "700", color: colors.primary },
  same: { fontSize: fontSize.small, fontWeight: "600", color: colors.mutedForeground },
  diff: { fontSize: fontSize.small, fontWeight: "600", color: colors.savingsInk, fontVariant: ["tabular-nums"] },
  missing: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  add: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.primary, paddingVertical: spacing.md,
  },
  addText: { fontSize: fontSize.caption, fontWeight: "700", color: "#FFFFFF" },
  stepper: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, padding: 4,
  },
  stepperButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  stepperCount: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  bone: { height: 14, borderRadius: 6, backgroundColor: colors.muted },
  boneBlock: { backgroundColor: colors.muted },
});
