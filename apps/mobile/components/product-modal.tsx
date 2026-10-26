import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Clock3, ExternalLink, Heart, Minus, Plus, Search } from "lucide-react-native";
import { Dialog } from "@/components/ui";
import { GroceryImage } from "@/components/grocery-image";
import { useAppState } from "@/lib/app-state";
import { cop, quantityLabel } from "@/lib/market";
import { isFresh, observedLabel } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export function ProductModal() {
  const { product, closeProduct, cart, favorites, addProduct, removeProduct, favoriteProduct, searchProduct } = useAppState();
  const count = cart.find(line => line.product.id === product?.id)?.count || 0;
  const favorite = favorites.some(item => item.id === product?.id);
  return (
    <Dialog visible={!!product} onClose={closeProduct}>
      {product && (
        <>
          <View>
            <GroceryImage
              src={product.image}
              alt={product.name}
              contain={!!product.offer}
              style={styles.image}
            />
            <Pressable accessibilityLabel="Guardar o quitar de favoritos" onPress={() => favoriteProduct(product)} style={styles.heart}>
              <Heart size={19} color={colors.primary} fill={favorite ? colors.primary : "transparent"} />
            </Pressable>
          </View>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.meta}>
            {quantityLabel(product.pack, product.unit)}
            {product.brand && ` · ${product.brand}`}
            {!product.offer && " para tu lista · Foto de referencia, no inventario de una tienda."}
          </Text>
          {product.offer ? (
            <View style={styles.offer}>
              <Text style={styles.price} selectable>
                {cop(product.offer.price)} <Text style={styles.priceUnit}>COP / empaque</Text>
              </Text>
              <View style={styles.offerRow}>
                <Clock3 size={12} color={colors.mutedForeground} />
                <Text style={styles.offerMeta}>{product.offer.store} · Tienda online · {observedLabel(product.offer)}</Text>
              </View>
              <Text style={styles.offerMeta}>Observado: {new Date(product.offer.observedAt).toLocaleString("es-CO")}</Text>
              <Text style={styles.offerMeta}>EAN: {product.offer.ean || "No informado: no afirmamos coincidencia exacta."}</Text>
              <Pressable onPress={() => Linking.openURL(product.offer!.url)} style={styles.offerRow}>
                <Text style={styles.verify}>Verificar en {product.offer.store}</Text>
                <ExternalLink size={12} color={colors.primary} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.offer}>
              <Text style={styles.ideaTitle}>Primero tu lista, después el precio real.</Text>
              <Text style={styles.ideaText}>No asignamos un precio ni una disponibilidad a esta idea de mercado. Puedes añadirla y corregir la cantidad antes de comparar.</Text>
            </View>
          )}
          <View style={styles.actions}>
            {count > 0 && (
              <View style={styles.stepper}>
                <Pressable accessibilityLabel="Quitar una cantidad" onPress={() => removeProduct(product.id)} style={styles.stepperButton}>
                  <Minus size={17} color={colors.primary} />
                </Pressable>
                <Text style={styles.stepperCount}>{count}</Text>
              </View>
            )}
            <Pressable onPress={() => addProduct(product)} style={styles.add}>
              <Plus size={17} color="#FFFFFF" />
              <Text style={styles.addText}>{count > 0 ? "Añadir otra cantidad" : "Agregar a mi canasta"}</Text>
            </Pressable>
          </View>
          <Pressable onPress={searchProduct} style={styles.search}>
            <Search size={14} color={colors.primary} />
            <Text style={styles.searchText}>Consultar precios actuales en las tiendas</Text>
          </Pressable>
          {!product.offer || !isFresh(product.offer) ? (
            <Text style={styles.fine}>Cobertura para Medellín por confirmar en la tienda. No realizamos compras.</Text>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  image: { height: 208, width: "100%", borderRadius: radius.lg, backgroundColor: colors.imageBg },
  heart: {
    position: "absolute", bottom: spacing.md, right: spacing.md, width: 40, height: 40,
    borderRadius: 20, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  },
  title: { fontSize: 24, fontWeight: "800", lineHeight: 30, letterSpacing: -0.5 },
  meta: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  offer: { borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.lg, gap: 6 },
  price: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, color: colors.primary, fontVariant: ["tabular-nums"] },
  priceUnit: { fontSize: fontSize.caption, fontWeight: "400" },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  offerMeta: { fontSize: fontSize.small, color: colors.mutedForeground, flexShrink: 1 },
  verify: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary, textDecorationLine: "underline" },
  ideaTitle: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  ideaText: { fontSize: fontSize.caption, lineHeight: 20, color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.md },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm,
  },
  stepperButton: { padding: spacing.sm },
  stepperCount: { fontSize: fontSize.subhead, fontWeight: "700" },
  add: {
    flex: 1, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg,
  },
  addText: { fontSize: fontSize.subhead, fontWeight: "700", color: "#FFFFFF" },
  search: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  searchText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  fine: { fontSize: fontSize.tiny, lineHeight: 16, textAlign: "center", color: colors.mutedForeground },
});
