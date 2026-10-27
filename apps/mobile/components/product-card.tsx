import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Heart, Minus, Plus } from "lucide-react-native";
import { observedLabel, type ShopProduct } from "@/lib/shop";
import { cop, quantityLabel } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { GroceryImage } from "./grocery-image";

export function ProductCard({ product, count, favorite, onAdd, onRemove, onFavorite, onOpen }: {
  product: ShopProduct; count: number; favorite: boolean;
  onAdd: () => void; onRemove: () => void; onFavorite: () => void; onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <Pressable accessibilityLabel={`Ver ${product.name}`} onPress={onOpen} style={styles.imagePress}>
          <GroceryImage src={product.image} alt={product.name} contain={!!product.offer} style={styles.image} />
        </Pressable>
        <Pressable
          accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
          onPress={onFavorite}
          style={styles.heart}
        >
          <Heart size={16} color={favorite ? colors.primary : colors.foreground} fill={favorite ? colors.primary : "transparent"} />
        </Pressable>
        {count === 0 ? (
          <Pressable accessibilityLabel={`Agregar ${product.name} a mi lista`} onPress={onAdd} style={styles.add}>
            <Plus size={22} strokeWidth={2.5} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.stepper}>
            <Pressable accessibilityLabel={`Quitar una cantidad de ${product.name}`} onPress={onRemove} style={styles.stepperButton}>
              <Minus size={17} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.stepperCount}>{count}</Text>
            <Pressable accessibilityLabel={`Agregar otra cantidad de ${product.name}`} onPress={onAdd} style={styles.stepperButton}>
              <Plus size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.body}>
        {product.offer ? (
          <Text style={styles.price}>{cop(product.offer.price)} <Text style={styles.priceUnit}>COP</Text></Text>
        ) : (
          <Text style={styles.unpriced}>Precio por verificar</Text>
        )}
        <Pressable onPress={onOpen}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
        </Pressable>
        <Text style={styles.pack}>{quantityLabel(product.pack, product.unit)}{!product.offer && " para tu lista"}</Text>
        {product.offer ? (
          <Text style={styles.meta}>
            {product.compare && product.compare.offers.length > 1 ? `Más barato en ${product.offer.store}` : product.offer.store}
            {" · "}{product.offer.source === "receipt" ? "factura" : "online"}{"\n"}{observedLabel(product.offer)}
          </Text>
        ) : (
          <Text style={styles.meta}>Foto de referencia · Sin marca definida</Text>
        )}
      </View>
    </View>
  );
}

/** Placeholder with the same footprint as ProductCard, shown while a search is in flight. */
export function ProductCardSkeleton() {
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
      <View style={[styles.imageWrap, styles.imagePress]} />
      <View style={styles.body}>
        <View style={[styles.bone, { width: "55%", height: 22 }]} />
        <View style={[styles.bone, { width: "90%" }]} />
        <View style={[styles.bone, { width: "70%", marginBottom: 6 }]} />
        <View style={[styles.bone, { width: "30%" }]} />
        <View style={[styles.bone, { width: "45%", height: 10 }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingBottom: spacing.md },
  imageWrap: { position: "relative", marginBottom: spacing.md, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.imageBg },
  imagePress: { height: 150 },
  image: { width: "100%", height: "100%" },
  heart: {
    position: "absolute", left: spacing.sm, top: spacing.sm, width: 32, height: 32,
    borderRadius: 16, backgroundColor: colors.floating,
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
  },
  add: {
    position: "absolute", right: spacing.sm, bottom: spacing.sm, width: 40, height: 40,
    borderRadius: 20, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.card,
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  stepper: {
    position: "absolute", right: spacing.sm, bottom: spacing.sm, height: 40,
    borderRadius: 20, backgroundColor: colors.primary,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.card,
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  stepperButton: { width: 28, height: 32, alignItems: "center", justifyContent: "center" },
  stepperCount: { minWidth: 12, textAlign: "center", fontSize: fontSize.subhead, fontWeight: "700", color: "#FFFFFF" },
  body: { paddingHorizontal: spacing.md, gap: 4 },
  price: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5, color: colors.primary, fontVariant: ["tabular-nums"] },
  priceUnit: { fontSize: fontSize.small, fontWeight: "400", color: colors.mutedForeground },
  unpriced: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  name: { fontSize: fontSize.body, fontWeight: "500", lineHeight: 20, color: colors.foreground, minHeight: 40 },
  pack: { fontSize: fontSize.caption, color: colors.mutedForeground },
  meta: { fontSize: fontSize.tiny, lineHeight: 14, color: colors.mutedForeground },
  bone: { height: 14, borderRadius: 6, backgroundColor: colors.muted },
});
