import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ExternalLink, Heart, Minus, Plus } from "lucide-react-native";
import { StoreLogo } from "./brand";
import { GroceryImage } from "./grocery-image";
import { cop, quantityLabel, type Offer, type Store } from "@/lib/market";
import type { ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** One product, every store that sells it, cheapest first. Adding uses the cheapest store's offer. */
export function CompareCard({ product, count, favorite, onAdd, onRemove, onFavorite, onOpen }: {
  product: ComparedProduct; count: number; favorite: boolean;
  onAdd: () => void; onRemove: () => void; onFavorite: () => void; onOpen: (offer: Offer) => void;
}) {
  const [best] = product.offers;
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
          <Verdict offers={product.offers} />
        </View>
        <Pressable
          accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
          onPress={onFavorite}
          style={styles.heart}
        >
          <Heart size={16} color={favorite ? colors.primary : colors.foreground} fill={favorite ? colors.primary : "transparent"} />
        </Pressable>
      </View>

      <StorePrices offers={product.offers} inStore={product.inStore} missing={product.missing} />

      {count === 0 ? (
        <Pressable accessibilityLabel={`Agregar ${product.name} a mi lista`} onPress={onAdd} style={styles.add}>
          <Plus size={16} strokeWidth={2.5} color="#FFFFFF" />
          <Text style={styles.addText}>Agregar a mi lista</Text>
        </Pressable>
      ) : (
        <View style={styles.stepper}>
          <Pressable accessibilityLabel={`Quitar una cantidad de ${product.name}`} onPress={onRemove} style={styles.stepperButton}>
            <Minus size={16} color={colors.primary} />
          </Pressable>
          <Text style={styles.stepperCount}>{count} en tu lista</Text>
          <Pressable accessibilityLabel={`Agregar otra cantidad de ${product.name}`} onPress={onAdd} style={styles.stepperButton}>
            <Plus size={16} color={colors.primary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** "Más barato en D1: $1.000 menos que en Jumbo", or which single store has it. Offers are cheapest first. */
export function Verdict({ offers }: { offers: Offer[] }) {
  const [best] = offers;
  if (offers.length < 2) return <Text style={styles.single}>Solo lo encontramos en {best!.store}</Text>;
  const cheapest = offers.filter(o => o.price === best!.price).map(o => o.store).join(" y ");
  const spread = offers.at(-1)!.price - best!.price;
  return (
    <Text style={styles.verdict}>
      {spread === 0 ? `Mismo precio en ${cheapest}` : `Más barato en ${cheapest}: ${cop(spread)} menos que en ${offers.at(-1)!.store}`}
    </Text>
  );
}

/**
 * One line per store: price, age and the difference from the cheapest. Online lines open the store's page.
 * A price read from a shopper's receipt says so; under an online line it shows as "En tienda: …".
 */
export function StorePrices({ offers, inStore = [], missing }: { offers: Offer[]; inStore?: Offer[]; missing: Store[] }) {
  const [best] = offers;
  const many = offers.length > 1;
  const spread = offers.at(-1)!.price - best!.price;
  return (
    <View style={styles.rowsWrap}>
      <View style={styles.rows}>
      {offers.map((offer, i) => {
        const reported = offer.source === "receipt";
        const below = inStore.find(r => r.store === offer.store);
        const content = (
          <>
            <View style={styles.row}>
              <View style={styles.logoSlot}><StoreLogo store={offer.store} /></View>
              <Text style={[styles.price, (i > 0 || !many || spread === 0) && styles.priceOther]}>{cop(offer.price)}{perLabel(offer)}</Text>
              <Text numberOfLines={1} style={styles.meta}>
                {offer.pack > 0 && offer.pack !== best!.pack ? `${quantityLabel(offer.pack, offer.unit)} · ` : ""}
                {reported ? "" : ageLabel(offer)}
              </Text>
              {i === 0 && many && spread > 0 && <Text style={styles.bestTag}>Mejor precio</Text>}
              {i > 0 && offer.price === best!.price ? (
                <Text style={styles.same}>Igual</Text>
              ) : i > 0 ? (
                <Text style={styles.diff}>+{cop(offer.price - best!.price)}</Text>
              ) : null}
              {!reported && <ExternalLink size={12} color={colors.mutedForeground} />}
            </View>
            {reported && <Text style={styles.inStore}>{reportedLabel(offer)}</Text>}
            {below && (
              <Text style={styles.inStore}>
                En tienda: {cop(below.price)}{perLabel(below)} · factura · {ageLabel(below)}{below.branch ? ` · ${below.branch}` : ""}
              </Text>
            )}
          </>
        );
        const rowStyle = [i > 0 && styles.rowDivider, i === 0 && many && spread > 0 && styles.rowBest];
        // Receipt prices have no store page to open.
        return reported ? (
          <View key={`${offer.id}:receipt`} accessibilityLabel={`${offer.store}: ${cop(offer.price)}, reportado en factura ${ageLabel(offer)}`} style={rowStyle}>
            {content}
          </View>
        ) : (
          <Pressable
            key={offer.id}
            accessibilityRole="link"
            accessibilityLabel={`${offer.store}: ${cop(offer.price)}. Ver en la tienda`}
            onPress={() => Linking.openURL(offer.url)}
            style={rowStyle}
          >
            {content}
          </Pressable>
        );
      })}
      </View>
      {missing.length > 0 && (
        <Text style={styles.missing}>No está en {missing.join(" ni ")}, según su catálogo online.</Text>
      )}
    </View>
  );
}

/** "/kg" or "/und" after a produce price, so per-kg and per-unit prices are never read as the same thing. */
function perLabel(offer: Offer) {
  return offer.produce ? (offer.produce.per === "kg" ? "/kg" : "/und") : "";
}

/** "Reportado en tienda · factura · hace 2 h · Jumbo Calle 80" */
function reportedLabel(offer: Offer) {
  return `Reportado en tienda · factura · ${ageLabel(offer)}${offer.branch ? ` · ${offer.branch}` : ""}`;
}

/** "hace 5 min" / "hace 2 h": how old the observed price is, short enough for one line. */
function ageLabel(offer: Offer) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(offer.observedAt).getTime()) / 60000));
  return mins < 1 ? "ahora" : mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins / 60)} h`;
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
        <View style={[styles.bone, { height: 76, borderRadius: radius.md }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.md },
  image: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.imageBg },
  info: { flex: 1, gap: 4 },
  name: { fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20, color: colors.foreground },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  verdict: { fontSize: fontSize.caption, lineHeight: 17, fontWeight: "600", color: colors.primary },
  single: { fontSize: fontSize.caption, color: colors.mutedForeground },
  heart: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  rowsWrap: { gap: spacing.sm },
  rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowBest: { backgroundColor: colors.secondary },
  logoSlot: { width: 64 },
  price: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  priceOther: { color: colors.foreground, fontWeight: "700" },
  meta: { flex: 1, fontSize: fontSize.tiny, color: colors.mutedForeground },
  same: { fontSize: fontSize.small, fontWeight: "600", color: colors.mutedForeground },
  bestTag: { fontSize: fontSize.small, fontWeight: "800", color: colors.primary },
  diff: { fontSize: fontSize.small, fontWeight: "600", color: colors.savingsInk, fontVariant: ["tabular-nums"] },
  missing: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  inStore: { fontSize: fontSize.tiny, color: colors.mutedForeground, paddingLeft: spacing.md + 64 + spacing.sm, paddingRight: spacing.md, paddingBottom: 7, marginTop: -3 },
  add: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.primary, minHeight: 40,
  },
  addText: { fontSize: fontSize.caption, fontWeight: "700", color: "#FFFFFF" },
  stepper: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, padding: 4,
  },
  stepperButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  stepperCount: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  bone: { height: 14, borderRadius: 6, backgroundColor: colors.muted },
  boneBlock: { backgroundColor: colors.muted },
});
