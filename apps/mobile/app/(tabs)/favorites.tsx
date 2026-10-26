import { FlatList, StyleSheet, Text, View } from "react-native";
import { Heart } from "lucide-react-native";
import { Button } from "@/components/ui";
import { ProductCard } from "@/components/product-card";
import { useAppState } from "@/lib/app-state";
import type { ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function FavoritesScreen() {
  const { favorites, cart, addProduct, removeProduct, favoriteProduct, openProduct, explore } = useAppState();
  const count = (id: string) => cart.find(line => line.product.id === id)?.count || 0;

  function renderProduct({ item }: { item: ShopProduct }) {
    return (
      <View style={styles.slot}>
        <ProductCard
          product={item}
          count={count(item.id)}
          favorite
          onAdd={() => addProduct(item)}
          onRemove={() => removeProduct(item.id)}
          onFavorite={() => favoriteProduct(item)}
          onOpen={() => openProduct(item)}
        />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Heart size={24} color={colors.primary} />
        <Text style={styles.headerTitle}>Tus favoritos</Text>
      </View>
      <Text style={styles.headerSub}>Guarda lo que te gusta para encontrarlo después. Los precios se verifican de nuevo al buscar.</Text>
      {favorites.length ? (
        <FlatList
          data={favorites}
          keyExtractor={item => item.id}
          numColumns={2}
          renderItem={renderProduct}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.empty}>
          <Heart size={40} color={colors.primary} />
          <Text style={styles.emptyTitle}>Lo que te gusta, cerquita.</Text>
          <Text style={styles.emptyText}>Toca el corazón de un producto para guardarlo aquí.</Text>
          <Button title="Seguir explorando" onPress={explore} />
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
  list: { gap: spacing.lg, paddingBottom: spacing.xxl },
  columns: { gap: spacing.lg },
  slot: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyTitle: { fontSize: fontSize.headline, fontWeight: "800" },
  emptyText: { fontSize: fontSize.caption, lineHeight: 20, textAlign: "center", color: colors.mutedForeground, maxWidth: 260 },
});
