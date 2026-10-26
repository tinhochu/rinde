import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Sparkles, Trash2, Wallet } from "lucide-react-native";
import { Button } from "@/components/ui";
import { GroceryImage } from "@/components/grocery-image";
import { useAppState } from "@/lib/app-state";
import { cop, quantityLabel } from "@/lib/market";
import { isFresh, observedLabel, type CartLine } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function CartScreen() {
  const { cart, budget, addProduct, removeProduct, deleteLine, clearCart, openProduct, openPlanner, explore } = useAppState();
  const [now] = useState(Date.now());
  const verified = cart.filter(line => isFresh(line.product.offer, now));
  const subtotal = verified.reduce((sum, line) => sum + line.count * line.product.offer!.price, 0);
  const unpriced = cart.length - verified.length;

  function renderLine({ item: line }: { item: CartLine }) {
    const { product, count } = line;
    const fresh = isFresh(product.offer, now);
    return (
      <View style={styles.line}>
        <Pressable onPress={() => openProduct(product)}>
          <GroceryImage src={product.image} alt={product.name} contain={!!product.offer} style={styles.thumb} />
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
          <Text style={styles.linePack}>{quantityLabel(product.pack, product.unit)} por cantidad</Text>
          {fresh ? (
            <>
              <Text style={styles.linePrice} selectable>
                {cop(product.offer!.price * count)} <Text style={styles.lineUnit}>({cop(product.offer!.price)} c/u)</Text>
              </Text>
              <Text style={styles.lineMeta}>{product.offer!.store} · Online · {observedLabel(product.offer!, now)}</Text>
            </>
          ) : (
            <Text style={styles.stale}>{product.offer ? "Precio anterior: requiere actualización" : "Precio por verificar"}</Text>
          )}
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
        <ShoppingBag size={24} color={colors.primary} />
        <Text style={styles.headerTitle}>Tu canasta</Text>
      </View>
      <Text style={styles.headerSub}>
        {cart.reduce((sum, line) => sum + line.count, 0)} cantidades añadidas. Una lista para comparar, no una compra realizada.
      </Text>

      {cart.length ? (
        <>
          <FlatList
            data={cart}
            keyExtractor={line => line.product.id}
            renderItem={renderLine}
            contentContainerStyle={styles.lines}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.budgetCard}>
                <Wallet size={16} color={colors.primary} />
                <Text style={styles.budgetLabel}>Tu presupuesto</Text>
                <Text style={styles.budgetValue} selectable>{cop(budget)}</Text>
              </View>
            }
            ListFooterComponent={
              <Pressable onPress={clearCart} style={styles.clear}>
                <Trash2 size={13} color={colors.destructive} />
                <Text style={styles.clearText}>Vaciar canasta</Text>
              </Pressable>
            }
          />
          <View style={styles.footer}>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{unpriced ? "Subtotal con precio vigente" : "Subtotal verificado"}</Text>
              <Text style={styles.subtotalValue} selectable>{verified.length ? cop(subtotal) : "Por verificar"}</Text>
            </View>
            {unpriced > 0 && (
              <Text style={styles.unpriced}>
                {unpriced} {unpriced === 1 ? "producto pendiente" : "productos pendientes"} de cotizar. El subtotal no representa toda la canasta.
              </Text>
            )}
            {subtotal > budget && <Text style={styles.over}>Los productos ya cotizados superan tu presupuesto en {cop(subtotal - budget)}.</Text>}
            <Button title="Comparar mi canasta" onPress={() => openPlanner()} icon={<Sparkles size={16} color="#FFFFFF" />} />
            <View style={styles.fine}>
              <ShieldCheck size={12} color={colors.mutedForeground} />
              <Text style={styles.fineText}>Verificamos de nuevo. Sin cobros, reservas ni domicilios incluidos.</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <ShoppingBag size={42} strokeWidth={1.3} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Aquí empieza tu mercado.</Text>
          <Text style={styles.emptyText}>Toca el + de los productos que necesitas. Después encontramos un plan para tu bolsillo.</Text>
          <Button title="Explorar productos" onPress={explore} icon={<ArrowRight size={15} color="#FFFFFF" />} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: colors.primary },
  headerSub: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  lines: { gap: spacing.md },
  budgetCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.lg,
  },
  budgetLabel: { flex: 1, fontSize: fontSize.caption, color: colors.primary },
  budgetValue: { fontSize: fontSize.subhead, fontWeight: "700", fontVariant: ["tabular-nums"] },
  line: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 80, height: 80, borderRadius: radius.md },
  lineBody: { flex: 1, gap: 4 },
  lineTop: { flexDirection: "row", gap: spacing.sm },
  lineName: { flex: 1 },
  lineTitle: { fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20 },
  trash: { padding: 4 },
  linePack: { fontSize: fontSize.caption, color: colors.mutedForeground },
  linePrice: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  lineUnit: { fontSize: fontSize.small, fontWeight: "400", color: colors.mutedForeground },
  lineMeta: { fontSize: fontSize.tiny, color: colors.mutedForeground },
  stale: { fontSize: fontSize.small, fontWeight: "600", color: colors.warnText },
  stepper: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 4, marginTop: spacing.sm,
  },
  stepperButton: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  stepperCount: { minWidth: 16, textAlign: "center", fontSize: fontSize.caption, fontWeight: "700" },
  clear: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  clearText: { fontSize: fontSize.caption, color: colors.destructive },
  footer: {
    gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.cartFooter, marginHorizontal: -spacing.lg, marginBottom: -spacing.lg,
    padding: spacing.lg,
  },
  subtotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subtotalLabel: { fontSize: fontSize.subhead },
  subtotalValue: { fontSize: 20, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  unpriced: { fontSize: fontSize.small, lineHeight: 16, color: colors.warnText },
  over: { fontSize: fontSize.caption, color: colors.destructive },
  fine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6 },
  fineText: { fontSize: fontSize.tiny, lineHeight: 14, color: colors.mutedForeground, textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyText: { fontSize: fontSize.caption, lineHeight: 20, textAlign: "center", color: colors.mutedForeground, maxWidth: 260 },
});
