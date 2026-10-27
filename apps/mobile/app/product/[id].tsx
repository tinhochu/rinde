import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ExternalLink, Heart, History, Search, ShieldCheck, TrendingDown, TriangleAlert } from "lucide-react-native";
import { AddControl } from "@/components/add-control";
import { StoreLogo } from "@/components/brand";
import { StorePrices } from "@/components/compare-card";
import { GroceryImage } from "@/components/grocery-image";
import { FadeIn, PressScale } from "@/components/motion";
import { Button } from "@/components/ui";
import { fetchHistory, type HistoryPoint } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { fetchBasket } from "@/lib/basket";
import { ageLabel, savings, unitPrice } from "@/lib/compare";
import { cop, quantityLabel, type Store } from "@/lib/market";
import { recallProduct, rememberProduct } from "@/lib/product-cache";
import { searchHref } from "@/lib/search";
import { fromOffer, type ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * /product/:id — one product at every store. Opens instantly from the screen that showed it; a fresh
 * load or shared link (or a saved product without its comparison) prices it again via /api/basket.
 */
export default function ProductScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(String(raw ?? ""));
  const { cart, favorites, stores: preferredStores, addProduct, removeProduct, favoriteProduct } = useAppState();
  const [product, setProduct] = useState<ShopProduct | undefined>(() => recallProduct(id));
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryPoint[] | null>();

  useEffect(() => {
    const known = recallProduct(id);
    setProduct(known);
    setError("");
    if (known?.compare?.offers.length) return;
    const controller = new AbortController();
    fetchBasket([id], controller.signal)
      .then(prices => {
        const line = prices.lines.find(l => l.id === id);
        if (!line?.offers.length) {
          setError("Ninguna tienda tiene hoy un precio para este producto.");
          return;
        }
        const best = line.offers[0]!;
        const next: ShopProduct = {
          ...(known ?? fromOffer(best, best.name, best.aisle ?? "all")),
          offer: best,
          compare: { offers: line.offers, inStore: line.inStore, missing: line.missing, produce: best.produce },
        };
        rememberProduct(next);
        setProduct(next);
      })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar los precios."); });
    return () => controller.abort();
  }, [id]);

  const offers = product?.compare?.offers ?? (product?.offer ? [product.offer] : []);
  const listingKey = offers.map(o => o.id).join(",");
  useEffect(() => {
    if (!listingKey) return;
    const controller = new AbortController();
    setHistory(undefined);
    fetchHistory(listingKey.split(","), controller.signal)
      .then(h => setHistory(h.points))
      .catch(() => { if (!controller.signal.aborted) setHistory(null); });
    return () => controller.abort();
  }, [listingKey]);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const best = offers[0];
  const saved = savings(offers);
  const count = product ? cart.find(line => line.product.id === product.id)?.count || 0 : 0;
  const favorite = !!product && favorites.some(p => p.id === product.id);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} hitSlop={6} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
          <ArrowLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text numberOfLines={1} style={styles.barTitle}>{product ? "Comparar precios" : ""}</Text>
        {product && (
          <Pressable
            accessibilityLabel={`${favorite ? "Quitar" : "Guardar"} ${product.name} ${favorite ? "de" : "en"} favoritos`}
            onPress={() => favoriteProduct(product)}
            hitSlop={6}
            style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
          >
            <Heart size={21} color={favorite ? colors.primary : colors.foreground} fill={favorite ? colors.primary : "transparent"} />
          </Pressable>
        )}
      </View>

      {!product ? (
        error ? (
          <View style={styles.center}>
            <TriangleAlert size={26} color={colors.primary} />
            <Text style={styles.messageTitle}>{error}</Text>
            <Button title="Volver" variant="outline" onPress={back} />
          </View>
        ) : (
          <ProductSkeleton />
        )
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <FadeIn style={styles.hero}>
              <GroceryImage src={product.image} alt={product.name} contain style={styles.image} />
            </FadeIn>

            <View style={styles.titleBlock}>
              <Text accessibilityRole="header" style={styles.name}>{product.name}</Text>
              <Text style={styles.specs}>
                {[
                  product.brand,
                  best?.produce ? (best.produce.per === "kg" ? "Precio por kilo" : "Precio por unidad") : product.pack > 0 ? quantityLabel(product.pack, product.unit) : "Tamaño sin informar",
                  best && unitPrice(best),
                ].filter(Boolean).join(" · ")}
              </Text>
            </View>

            {best && (
              <FadeIn delay={60} style={styles.bestCard}>
                <Text style={styles.bestLabel}>{offers.length > 1 ? `Mejor precio de ${offers.length} tiendas` : "Precio"}</Text>
                <Text style={styles.bestPrice}>{cop(best.price)}</Text>
                <View style={styles.bestWhere}>
                  <StoreLogo store={best.store} small />
                  <Text style={styles.bestWhereText}>
                    {best.store} · {best.source === "receipt" ? "factura de un comprador" : "tienda online"} · {ageLabel(best.observedAt)}
                  </Text>
                </View>
                {saved && (
                  <FadeIn delay={220} style={styles.saving}>
                    <TrendingDown size={15} color={colors.savingsInk} />
                    <Text style={styles.savingText}>Ahorras {cop(saved.amount)} frente a {saved.versus}</Text>
                  </FadeIn>
                )}
              </FadeIn>
            )}

            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Precio en cada tienda</Text>
              <StorePrices offers={offers} inStore={product.compare?.inStore} missing={product.compare?.missing ?? []} />
              <View style={styles.trust}>
                <ShieldCheck size={14} color={colors.mutedForeground} />
                <Text style={styles.trustText}>
                  {product.compare?.produce
                    ? `Precios ${product.compare.produce.per === "kg" ? "por kilo" : "por unidad"} de la misma fruta o verdura en cada tienda.`
                    : `Mismo código de barras${best?.ean ? ` (EAN ${best.ean})` : ""} en cada tienda.`}
                  {" "}Cada fila dice cuándo vimos el precio; toca una tienda para verificarlo en su página.
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <History size={17} color={colors.primary} />
                <Text accessibilityRole="header" style={styles.sectionTitle}>Historial de precios</Text>
              </View>
              <PriceHistory points={history} />
            </View>

            <PressScale accessibilityRole="link" onPress={() => router.push(searchHref(product.term, { stores: preferredStores }))} style={styles.similar}>
              <Search size={16} color={colors.primary} />
              <Text style={styles.similarText}>Buscar productos similares a “{product.term}”</Text>
            </PressScale>
          </ScrollView>

          <View style={styles.footer}>
            <AddControl name={product.name} count={count} onAdd={() => addProduct(product)} onRemove={() => removeProduct(product.id)} />
            {best && best.source !== "receipt" && (
              <PressScale accessibilityRole="link" accessibilityLabel={`Ver en ${best.store}`} onPress={() => Linking.openURL(best.url)} style={styles.visit}>
                <Text style={styles.visitText}>Ver en {best.store}</Text>
                <ExternalLink size={15} color={colors.primary} />
              </PressScale>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * Only observed prices: changes per store, or how long a price has held. Too little data says so; no
 * line is drawn between days we didn't see.
 */
function PriceHistory({ points }: { points: HistoryPoint[] | null | undefined }) {
  if (points === undefined) return <View style={[styles.bone, { height: 64, borderRadius: radius.md }]} />;
  if (points === null) return <Text style={styles.note}>No pudimos cargar el historial. Los precios de arriba siguen vigentes.</Text>;

  const byStore = new Map<Store, HistoryPoint[]>();
  for (const p of points) byStore.set(p.store, [...(byStore.get(p.store) ?? []), p]);
  const first = points[0]?.day;
  const days = new Set(points.map(p => p.day)).size;
  if (!first || days < 2) {
    return (
      <Text style={styles.note}>
        {first ? `Guardamos precios de este producto desde el ${dayLabel(first)}. ` : ""}
        Aún no hay suficientes días para mostrar cómo cambia.
      </Text>
    );
  }
  const changes = [...byStore.entries()].flatMap(([store, list]) =>
    list.slice(1).filter((p, i) => p.price !== list[i]!.price).map(p => ({ store, day: p.day, from: list[list.indexOf(p) - 1]!.price, to: p.price })),
  ).sort((a, b) => b.day.localeCompare(a.day));
  if (!changes.length) {
    return <Text style={styles.note}>Sin cambios desde el {dayLabel(first)} en {[...byStore.keys()].join(", ")} ({days} días con precio observado).</Text>;
  }
  return (
    <View style={styles.changes}>
      {changes.slice(0, 8).map(c => (
        <View key={`${c.store}-${c.day}`} style={styles.change}>
          <StoreLogo store={c.store} small />
          <Text style={styles.changeDay}>{dayLabel(c.day)}</Text>
          <Text style={styles.changeFrom}>{cop(c.from)}</Text>
          <Text style={styles.changeArrow}>→</Text>
          <Text style={[styles.changeTo, c.to < c.from ? styles.down : styles.up]}>{cop(c.to)}</Text>
        </View>
      ))}
      <Text style={styles.note}>Últimos {days} días con precio observado. Un día sin observación no aparece.</Text>
    </View>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayLabel = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]}`;
};

function ProductSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.page}>
      <View style={[styles.bone, { height: 200, borderRadius: radius.lg }]} />
      <View style={[styles.bone, { height: 22, width: "80%", borderRadius: 6 }]} />
      <View style={[styles.bone, { height: 14, width: "45%", borderRadius: 6 }]} />
      <View style={[styles.bone, { height: 120, borderRadius: radius.lg }]} />
      <View style={[styles.bone, { height: 140, borderRadius: radius.md }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: colors.muted },
  barTitle: { flex: 1, fontSize: fontSize.subhead, fontWeight: "700", color: colors.mutedForeground, textAlign: "center" },
  page: { padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.xl, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.lg, backgroundColor: colors.imageBg, padding: spacing.lg, alignItems: "center" },
  image: { width: "100%", height: 180, backgroundColor: colors.imageBg },
  titleBlock: { gap: 4 },
  name: { fontSize: 23, fontWeight: "800", lineHeight: 28, letterSpacing: -0.5, color: colors.foreground },
  specs: { fontSize: fontSize.body, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  bestCard: { borderRadius: radius.lg, backgroundColor: colors.secondary, padding: spacing.lg, gap: 4 },
  bestLabel: { fontSize: fontSize.caption, fontWeight: "700", color: colors.secondaryForeground },
  bestPrice: { fontSize: 34, fontWeight: "800", letterSpacing: -1, color: colors.primary, fontVariant: ["tabular-nums"] },
  bestWhere: { flexDirection: "row", alignItems: "center", gap: 6 },
  bestWhereText: { flexShrink: 1, fontSize: fontSize.caption, fontWeight: "600", color: colors.foreground },
  saving: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.savingsBg, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  savingText: { fontSize: fontSize.caption, fontWeight: "800", color: colors.savingsInk },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.title + 1, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  trust: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  trustText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  note: { fontSize: fontSize.caption, lineHeight: 17, color: colors.mutedForeground },
  changes: { gap: spacing.sm },
  change: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  changeDay: { width: 52, fontSize: fontSize.caption, color: colors.mutedForeground },
  changeFrom: { fontSize: fontSize.body, color: colors.mutedForeground, textDecorationLine: "line-through", fontVariant: ["tabular-nums"] },
  changeArrow: { fontSize: fontSize.body, color: colors.mutedForeground },
  changeTo: { fontSize: fontSize.subhead, fontWeight: "800", fontVariant: ["tabular-nums"] },
  down: { color: colors.primary },
  up: { color: colors.savingsInk },
  similar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  similarText: { flexShrink: 1, fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  footer: {
    flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
  },
  visit: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
  },
  visitText: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  messageTitle: { fontSize: fontSize.title, fontWeight: "700", textAlign: "center", color: colors.foreground },
  bone: { backgroundColor: colors.muted },
});
