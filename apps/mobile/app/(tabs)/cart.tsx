import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ArrowRight, ListPlus, Minus, Plus, ListChecks, ShieldCheck, Sparkles, Trash2, Wallet } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { Button } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
import { GroceryImage } from "@/components/grocery-image";
import { useAppState } from "@/lib/app-state";
import { fetchBasket, singleStores, stopsFor, type BasketLine, type BasketPrices, type PricedLine, type SingleStore, type Stop } from "@/lib/basket";
import { cop, quantityLabel } from "@/lib/market";
import { IDEAS, type CartLine } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function CartScreen() {
  const { cart, favorites, budget, addProduct, removeProduct, deleteLine, clearCart, favoriteProduct, openProduct, openPlanner, explore } = useAppState();
  const [prices, setPrices] = useState<BasketPrices | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  // Prices depend on which products are in the basket, not how many of each.
  const ids = useMemo(() => cart.map(line => line.product.id).sort().join("|"), [cart]);

  useFocusEffect(useCallback(() => setRefresh(n => n + 1), []));
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    setError("");
    fetchBasket(ids.split("|"), controller.signal)
      .then(setPrices)
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar los precios."); });
    return () => controller.abort();
  }, [ids, refresh]);

  const byId = new Map(prices?.lines.map(l => [l.id, l]));
  const priced: PricedLine[] = cart.flatMap(line => { const p = byId.get(line.product.id); return p ? [{ cart: line, prices: p }] : []; });
  const pending = prices ? cart.filter(line => !byId.has(line.product.id)) : cart;
  const stops = stopsFor(priced);
  const total = stops.reduce((sum, stop) => sum + stop.total, 0);
  const alone = singleStores(priced);
  const count = cart.reduce((sum, line) => sum + line.count, 0);
  const loading = !prices && !error;

  function renderLine(line: CartLine, best?: BasketLine) {
    const { product, count } = line;
    const offer = best?.offers[0];
    return (
      <View key={product.id} style={styles.line}>
        <Pressable onPress={() => openProduct(product)}>
          <GroceryImage src={product.image} alt={product.name} contain={!product.id.startsWith("idea-")} style={styles.thumb} />
        </Pressable>
        <View style={styles.lineBody}>
          <View style={styles.lineTop}>
            <Pressable onPress={() => openProduct(product)} style={styles.lineName}>
              <Text numberOfLines={2} style={styles.lineTitle}>{product.name}</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Eliminar ${product.name}`} onPress={() => deleteLine(product.id)} style={styles.trash}>
              <Trash2 size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {offer ? (
            <Text style={styles.linePrice} selectable>
              {cop(offer.price * count)}{count > 1 && <Text style={styles.lineUnit}>  {count} × {cop(offer.price)}</Text>}
            </Text>
          ) : (
            <Text style={styles.lineMeta}>
              {loading ? "Consultando precios…" : `${quantityLabel(product.pack, product.unit)} · lo buscamos en cada tienda al armar tu plan`}
            </Text>
          )}
          {best && <Elsewhere line={best} count={count} />}
          <View style={styles.stepper}>
            <Pressable accessibilityLabel={`Quitar una cantidad de ${product.name}`} onPress={() => removeProduct(product.id)} style={styles.stepperButton}>
              <Minus size={14} color={colors.primary} />
            </Pressable>
            <Text style={styles.stepperCount}>{count}</Text>
            <Pressable accessibilityLabel={`Añadir una cantidad de ${product.name}`} onPress={() => addProduct(product)} style={styles.stepperButton}>
              <Plus size={14} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <ListChecks size={24} color={colors.primary} />
        <Text style={styles.headerTitle}>Tu lista</Text>
      </View>
      {cart.length > 0 && (
        <Text style={styles.headerSub}>
          {count} {count === 1 ? "producto" : "productos"} · {loading ? "consultando precios de hoy…" : "precios de hoy en cada tienda"}
        </Text>
      )}

      {cart.length ? (
        <>
          <ScrollView contentContainerStyle={styles.lines} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
            {stops.length > 0 && <Summary total={total} stops={stops} budget={budget} alone={alone} pricedCount={priced.length} />}
            {error ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{error}</Text>
                <Pressable onPress={() => setRefresh(n => n + 1)}><Text style={styles.retry}>Reintentar</Text></Pressable>
              </View>
            ) : null}

            {stops.map(stop => (
              <View key={stop.store} style={styles.stop}>
                <View style={styles.stopHeader}>
                  <StoreLogo store={stop.store} />
                  <Text style={styles.stopCount}>{stop.lines.length} {stop.lines.length === 1 ? "producto" : "productos"} más barato aquí</Text>
                  <Text style={styles.stopTotal} selectable>{cop(stop.total)}</Text>
                </View>
                {stop.lines.map(line => renderLine(line.cart, line.prices))}
              </View>
            ))}

            {pending.length > 0 && (
              <View style={styles.stop}>
                {prices && (
                  <View style={styles.stopHeader}>
                    <Text style={styles.pendingTitle}>Por cotizar en tu plan</Text>
                  </View>
                )}
                {pending.map(line => renderLine(line))}
              </View>
            )}

            <Pressable onPress={clearCart} style={styles.clear}>
              <Trash2 size={13} color={colors.destructive} />
              <Text style={styles.clearText}>Vaciar lista</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>
                {stops.length ? `Total en ${stops.length} ${stops.length === 1 ? "tienda" : "tiendas"}` : "Total"}
                {stops.length > 0 && pending.length > 0 && <Text style={styles.subtotalNote}>  + {pending.length} por cotizar</Text>}
              </Text>
              <Text style={styles.subtotalValue} selectable>{stops.length ? cop(total) : loading ? "…" : "Por cotizar"}</Text>
            </View>
            {total > budget && <Text style={styles.over}>Te pasas de tu presupuesto por {cop(total - budget)}. Tu plan propone cambios.</Text>}
            <Button title="Armar mi plan" onPress={() => openPlanner()} icon={<Sparkles size={16} color="#FFFFFF" />} />
            <View style={styles.fine}>
              <ShieldCheck size={12} color={colors.mutedForeground} />
              <Text style={styles.fineText}>El plan suma el costo de cada parada y verifica los precios de nuevo.</Text>
            </View>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.emptyPage} showsVerticalScrollIndicator={false}>
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <ListChecks size={36} strokeWidth={1.3} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Aquí empieza tu mercado.</Text>
            <Text style={styles.emptyText}>Toca el + de los productos que necesitas. Después encontramos un plan para tu bolsillo.</Text>
            <View style={styles.emptyActions}>
              <Button title="Explorar productos" onPress={explore} icon={<ArrowRight size={15} color="#FFFFFF" />} />
              <Button title="Escribir productos" variant="outline" onPress={() => openPlanner(false)} icon={<ListPlus size={15} color={colors.primary} />} />
            </View>
            <View style={styles.budgetRow}>
              <Wallet size={14} color={colors.primary} />
              <Text style={styles.budgetRowText}>Tu presupuesto: <Text style={styles.budgetRowStrong}>{cop(budget)}</Text></Text>
            </View>
          </View>

          <Text style={styles.ideasTitle}>Básicos para empezar</Text>
          <Text style={styles.ideasSub}>Agrégalos y verificamos el precio en cada tienda al armar tu plan.</Text>
          <View style={styles.ideas}>
            {IDEAS.slice(0, 4).map(product => (
              <View key={product.id} style={styles.idea}>
                <ProductCard
                  product={product}
                  count={0}
                  favorite={favorites.some(f => f.id === product.id)}
                  onAdd={() => addProduct(product)}
                  onRemove={() => removeProduct(product.id)}
                  onFavorite={() => favoriteProduct(product)}
                  onOpen={() => openProduct(product)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** The split against buying everything at one store, and how much of the budget it uses. */
function Summary({ total, stops, budget, alone, pricedCount }: { total: number; stops: Stop[]; budget: number; alone: SingleStore[]; pricedCount: number }) {
  const share = Math.min(1, total / budget);
  // With one stop, that store is the answer; the others are what it beats.
  const others = stops.length === 1 ? alone.filter(a => a.store !== stops[0]!.store) : alone;
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLabel}>
        {stops.length === 1 ? `Todo está más barato en ${stops[0]!.store}` : "Comprando cada cosa donde está más barata"}
      </Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryTotal} selectable>{cop(total)}</Text>
        <Text style={styles.summaryStops}>{stops.length === 1 ? `en ${stops[0]!.store}` : `en ${stops.length} tiendas`}</Text>
      </View>
      <View style={styles.meter}><View style={[styles.meterFill, { width: `${share * 100}%` }, total > budget && styles.meterOver]} /></View>
      <Text style={styles.summaryBudget}>
        {total > budget ? `${cop(total - budget)} por encima` : `Te quedan ${cop(budget - total)}`} de tu presupuesto de {cop(budget)}
      </Text>
      {others.length > 0 && (
        <View style={styles.alone}>
          {others.map(a => (
            <View key={a.store} style={styles.aloneRow}>
              <Text style={styles.aloneStore}>Todo en {a.store}</Text>
              {a.has === pricedCount ? (
                <>
                  <Text style={styles.aloneTotal}>{cop(a.total)}</Text>
                  <Text style={styles.aloneDiff}>+{cop(a.total - total)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.aloneTotal}>{cop(a.total)}</Text>
                  <Text style={styles.aloneMissing}>sin {pricedCount - a.has === 1 ? "1 producto" : `${pricedCount - a.has} productos`}</Text>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** "Jumbo +$216 · Éxito +$440 · no está en D1": what this line would cost more at the other stores. */
function Elsewhere({ line, count }: { line: BasketLine; count: number }) {
  const [best, ...rest] = line.offers;
  const parts = [
    ...rest.map(o => `${o.store} ${o.price === best!.price ? "igual" : `+${cop((o.price - best!.price) * count)}`}${o.source === "receipt" ? " (factura)" : ""}`),
    ...line.missing.map(s => `no está en ${s}`),
  ];
  const reported = best!.source === "receipt" ? "Reportado en factura · " : "";
  if (!parts.length && !reported) return <Text style={styles.lineMeta}>Solo lo encontramos en {best!.store}</Text>;
  return <Text style={styles.lineMeta}>{reported}{parts.join(" · ") || `solo en ${best!.store}`}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.primary },
  headerSub: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  lines: { gap: spacing.lg, paddingBottom: spacing.md },
  summary: { borderRadius: radius.lg, backgroundColor: colors.secondary, padding: spacing.lg, gap: 6 },
  summaryLabel: { fontSize: fontSize.caption, color: colors.secondaryForeground },
  summaryRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  summaryTotal: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8, color: colors.primary, fontVariant: ["tabular-nums"] },
  summaryStops: { fontSize: fontSize.caption, fontWeight: "600", color: colors.secondaryForeground },
  meter: { height: 6, borderRadius: 3, backgroundColor: colors.card, overflow: "hidden", marginTop: 2 },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  meterOver: { backgroundColor: colors.destructive },
  summaryBudget: { fontSize: fontSize.small, color: colors.secondaryForeground },
  alone: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.secondaryBorder, gap: 4 },
  aloneRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  aloneStore: { flex: 1, fontSize: fontSize.caption, color: colors.foreground },
  aloneTotal: { fontSize: fontSize.caption, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground },
  aloneDiff: { minWidth: 64, textAlign: "right", fontSize: fontSize.small, fontWeight: "600", color: colors.savingsInk, fontVariant: ["tabular-nums"] },
  aloneMissing: { minWidth: 64, textAlign: "right", fontSize: fontSize.small, color: colors.mutedForeground },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.warnBg, padding: spacing.md },
  noticeText: { flex: 1, fontSize: fontSize.small, lineHeight: 16, color: colors.warnInk },
  retry: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  stop: { gap: spacing.md },
  stopHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  stopCount: { flex: 1, fontSize: fontSize.small, color: colors.mutedForeground },
  stopTotal: { fontSize: fontSize.subhead, fontWeight: "800", fontVariant: ["tabular-nums"], color: colors.foreground },
  pendingTitle: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  line: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 80, height: 80, borderRadius: radius.md },
  lineBody: { flex: 1, gap: 4 },
  lineTop: { flexDirection: "row", gap: spacing.sm },
  lineName: { flex: 1 },
  lineTitle: { fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20, color: colors.foreground },
  trash: { padding: 4 },
  linePrice: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  lineUnit: { fontSize: fontSize.small, fontWeight: "400", color: colors.mutedForeground },
  lineMeta: { fontSize: fontSize.tiny, color: colors.mutedForeground },
  stepper: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 4, marginTop: spacing.sm,
  },
  stepperButton: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  stepperCount: { minWidth: 16, textAlign: "center", fontSize: fontSize.caption, fontWeight: "700", color: colors.foreground },
  clear: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  clearText: { fontSize: fontSize.caption, color: colors.destructive },
  footer: {
    gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.cartFooter, marginHorizontal: -spacing.lg, marginBottom: -spacing.lg,
    padding: spacing.lg,
  },
  subtotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subtotalLabel: { flex: 1, fontSize: fontSize.subhead, color: colors.foreground },
  subtotalNote: { fontSize: fontSize.small, color: colors.mutedForeground },
  subtotalValue: { fontSize: 20, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  over: { fontSize: fontSize.caption, color: colors.destructive },
  fine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6 },
  fineText: { fontSize: fontSize.tiny, lineHeight: 14, color: colors.mutedForeground, textAlign: "center" },
  emptyPage: { gap: spacing.md, paddingBottom: spacing.xl },
  empty: {
    alignItems: "center", gap: spacing.md, padding: spacing.xl,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  emptyActions: { alignSelf: "stretch", gap: spacing.sm },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  budgetRowText: { fontSize: fontSize.caption, color: colors.mutedForeground },
  budgetRowStrong: { fontWeight: "700", color: colors.primary },
  ideasTitle: { marginTop: spacing.md, fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
  ideasSub: { marginTop: -spacing.sm, fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  idea: { width: "47%", flexGrow: 1 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },
  emptyText: { fontSize: fontSize.caption, lineHeight: 20, textAlign: "center", color: colors.mutedForeground, maxWidth: 260 },
});
