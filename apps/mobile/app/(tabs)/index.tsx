import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, ChevronDown, ChevronRight, MapPin, ListChecks, ShieldCheck } from "lucide-react-native";
import { Brand } from "@/components/brand";
import { GroceryImage } from "@/components/grocery-image";
import { BasicRow, BasicRowSkeleton } from "@/components/basic-row";
import { FeaturedCompare, FeaturedEmpty, FeaturedSkeleton } from "@/components/home/featured-compare";
import { QuickActions } from "@/components/home/quick-actions";
import { SearchEntry } from "@/components/home/search-field";
import { StoreFilterBar } from "@/components/home/store-filter";
import { animateNextLayout, PressScale } from "@/components/motion";
import { useAppState } from "@/lib/app-state";
import { fetchCatalog } from "@/lib/api";
import { fetchBasics, type Basic } from "@/lib/basket";
import { allStores, savings, toggleStore, withinStores, type StoreFilter } from "@/lib/compare";
import { topPicks } from "@/lib/history";
import { cop, Store, STORES, type Aisle } from "@/lib/market";
import { searchHref } from "@/lib/search";
import { CATEGORIES, ComparedProduct, fromOffer, IDEAS, photo, ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

/** Shown in "Compara en segundos" when the person's own staples have no product priced at two stores. */
const FEATURED_TERM = "leche entera";

/** Home: discovery only. Every search, category and "ver similares" opens /search; nothing here turns into results. */
export default function HomeScreen() {
  const { cart, favorites, area, budget, addProduct, removeProduct, favoriteProduct, openProduct, openPlanner, openModal } = useAppState();
  // Which stores to compare. Carried into /search, so results start with the same choice.
  const [stores, setStores] = useState<StoreFilter>([]);
  // The person's own staples (receipts, then picks from search); generic ideas until there are any.
  const [mine, setMine] = useState<ShopProduct[]>([]);
  const [mineLoaded, setMineLoaded] = useState(false);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    topPicks()
      .then(ids => fetchBasics(ids, controller.signal))
      .then(items => setMine(items.map(toBasic)))
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setMineLoaded(true); });
    return () => controller.abort();
  }, []));
  // A real comparison for the home screen when the staples don't have one: undefined while loading.
  const [sample, setSample] = useState<ComparedProduct[] | null>();
  const totalCount = cart.reduce((sum, line) => sum + line.count, 0);

  function search(term: string, aisle?: Aisle) {
    router.push(searchHref(term, { stores, aisle }));
  }

  function selectStore(store: Store | "all") {
    animateNextLayout();
    setStores(previous => toggleStore(previous, store));
  }

  const toShop = (p: ComparedProduct): ShopProduct => ({
    ...fromOffer(p.offers[0]!, p.name, p.aisle),
    compare: { offers: p.offers, inStore: p.inStore, missing: p.missing, produce: p.produce },
  });

  // Staples limited to the chosen stores; one without a price there keeps its row and says so.
  const personal = mine.length > 0;
  const basics: ShopProduct[] = personal
    ? mine.map(p => {
        const within = p.compare ? withinStores(p.compare, stores) : null;
        return within ? { ...p, offer: within.offers[0], compare: within } : { ...p, offer: undefined, compare: undefined };
      })
    : IDEAS.slice(0, 6);

  // "Compara en segundos": the staple with the biggest saving across the chosen stores, else a live sample.
  const ownFeatured = basics.filter(p => (p.compare?.offers.length ?? 0) > 1)
    .sort((a, b) => (savings(b.compare!.offers)?.amount ?? 0) - (savings(a.compare!.offers)?.amount ?? 0))[0];
  const sampleFeatured = sample?.map(p => withinStores(p, stores)).find((p): p is ComparedProduct => !!p && p.offers.length > 1);
  const featured = ownFeatured ?? (sampleFeatured ? toShop(sampleFeatured) : undefined);
  const needSample = mineLoaded && !ownFeatured && sample === undefined;
  useEffect(() => {
    if (!needSample) return;
    const controller = new AbortController();
    fetchCatalog(FEATURED_TERM, "all", controller.signal)
      .then(data => setSample(data.products))
      .catch(() => { if (!controller.signal.aborted) setSample(null); });
    return () => controller.abort();
  }, [needSample]);
  const featuredLoading = !featured && stores.length !== 1 && (!mineLoaded || sample === undefined);

  const count = (id: string) => cart.find(line => line.product.id === id)?.count || 0;
  const favorite = (id: string) => favorites.some(p => p.id === id);

  // How many staples each store has a price for, so thin coverage is visible on its chip.
  const counts = personal
    ? Object.fromEntries(STORES.map(s => [s, mine.filter(p => p.compare?.offers.some(o => o.store === s)).length])) as Record<Store, number>
    : undefined;

  type Cell = ShopProduct | "skeleton";
  const shown: Cell[] = mineLoaded || !personal ? basics : Array<Cell>(4).fill("skeleton");

  return (
    <FlatList
      data={shown}
      keyExtractor={(item, index) => (item !== "skeleton" ? item.id : `skeleton-${index}`)}
      renderItem={({ item, index }) =>
        item === "skeleton" ? <BasicRowSkeleton /> : (
          <BasicRow
            product={item}
            index={index}
            count={count(item.id)}
            favorite={favorite(item.id)}
            onOpen={() => openProduct(item)}
            onAdd={() => addProduct(item)}
            onRemove={() => removeProduct(item.id)}
            onFavorite={() => favoriteProduct(item)}
            onLookup={() => search(item.term)}
          />
        )}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <View style={styles.top}>
            <View style={styles.topBar}>
              <Brand small />
              <PressScale accessibilityRole="button" accessibilityLabel={`Tu zona: ${area}. Cambiar`} onPress={() => openModal("area")} style={styles.area}>
                <MapPin size={14} color={colors.primary} />
                <Text numberOfLines={1} style={styles.areaText}>{area.split(",")[0]}</Text>
                <ChevronDown size={13} color={colors.mutedForeground} />
              </PressScale>
            </View>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.headline}>Tu mercado, al mejor precio.</Text>
              <Text style={styles.lede}>Compara supermercados y descubre dónde ahorrar.</Text>
            </View>
            <SearchEntry onPress={() => router.push(searchHref("", { stores }))} />
            <QuickActions
              onList={() => openPlanner()}
              onReceipt={() => toast.success("Muy pronto podrás escanear tu factura y ganar puntos por cada precio que compartas.")}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Compara en segundos</Text>
              {featured && (
                <Pressable onPress={() => search(featured.term)} hitSlop={8} style={styles.sectionLink}>
                  <Text style={styles.sectionLinkText}>Ver similares</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </Pressable>
              )}
            </View>
            {featured ? (
              <FeaturedCompare
                key={featured.id}
                product={featured}
                count={count(featured.id)}
                onCompare={() => openProduct(featured)}
                onAdd={() => addProduct(featured)}
                onRemove={() => removeProduct(featured.id)}
              />
            ) : featuredLoading ? (
              <FeaturedSkeleton />
            ) : (
              <FeaturedEmpty
                oneStore={stores.length === 1 ? stores[0] : undefined}
                onSearch={() => search(FEATURED_TERM)}
                onAllStores={() => selectStore("all")}
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.filterLabel}>Comparar en</Text>
            <StoreFilterBar filter={stores} counts={counts} onChange={selectStore} />
          </View>

          <FlatList
            horizontal
            style={styles.bleed}
            data={CATEGORIES.slice(1)}
            keyExtractor={c => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.aisles}
            renderItem={({ item: c }) => (
              <PressScale accessibilityRole="button" accessibilityLabel={`Comparar ${c.name}`} onPress={() => search(c.term, c.id as Aisle)} style={styles.aisle}>
                <View style={[styles.aisleImage, { backgroundColor: c.color }]}>
                  <GroceryImage src={photo(c.image, 140)} alt="" style={styles.aisleThumb} />
                </View>
                <Text numberOfLines={2} style={styles.aisleName}>{c.name}</Text>
              </PressScale>
            )}
          />

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{personal ? "Lo que compras seguido" : "Los básicos de tu semana"}</Text>
            <Text style={styles.sectionSub}>
              {personal
                ? allStores(stores)
                  ? "De tus facturas y lo que eliges al buscar, con el precio más bajo de hoy."
                  : `Con el precio más bajo de hoy en ${stores.join(" y ")}.`
                : "Ideas para empezar: toca uno para ver su precio de hoy. Cuando busques o agregues productos, aquí verás los tuyos."}
            </Text>
          </View>
        </View>
      }
      ListFooterComponent={
        <View style={styles.footerBlock}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={totalCount ? "Comparar mi lista en cada tienda" : "Crear mi lista para comparar"}
            onPress={() => (totalCount ? router.push("/cart") : openPlanner())}
            scaleTo={0.985}
            style={styles.basket}
          >
            <View style={styles.basketIcon}>
              <ListChecks size={22} color={colors.primary} />
            </View>
            <View style={styles.basketBody}>
              <Text style={styles.basketTitle}>¿Dónde sale más barato tu mercado?</Text>
              <Text style={styles.basketText}>
                {totalCount
                  ? `Tienes ${totalCount} ${totalCount === 1 ? "producto" : "productos"}. Mira el total en cada tienda, contando los que le faltan a cada una.`
                  : "Arma tu lista y sumamos el total en Éxito, Jumbo y D1, contando los productos que le faltan a cada una."}
              </Text>
              <View style={styles.basketGo}>
                <Text style={styles.basketGoText}>{totalCount ? "Comparar mi lista" : "Crear mi lista"}</Text>
                <ArrowRight size={15} color={colors.primary} />
              </View>
            </View>
          </PressScale>
          <View style={styles.footer}>
            <View style={styles.trust}>
              <ShieldCheck size={13} color={colors.mutedForeground} />
              <Text style={styles.footerText}>Solo precios vistos en las tiendas, con hora y enlace. Presupuesto: {cop(budget)}.</Text>
            </View>
            <View style={styles.footerLinks}>
              <Pressable onPress={() => openModal("help")} hitSlop={8}><Text style={styles.footerLink}>Cómo funciona</Text></Pressable>
              <Pressable onPress={() => openModal("saved")} hitSlop={8}><Text style={styles.footerLink}>Planes guardados</Text></Pressable>
              <Pressable onPress={() => openModal("privacy")} hitSlop={8}><Text style={styles.footerLink}>Privacidad</Text></Pressable>
            </View>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  // FlatList gap only separates header / rows / footer; these space the sections inside them.
  headerBlock: { gap: spacing.xl, marginBottom: spacing.xs },
  footerBlock: { gap: spacing.xl, marginTop: spacing.lg },
  top: { gap: spacing.lg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  area: {
    flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 170, minHeight: 36, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  areaText: { flexShrink: 1, fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  intro: { gap: 4 },
  headline: { fontSize: 27, lineHeight: 31, fontWeight: "800", letterSpacing: -0.9, color: colors.foreground },
  lede: { fontSize: fontSize.subhead, lineHeight: 20, color: colors.mutedForeground },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: fontSize.headline - 2, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
  sectionSub: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  sectionLinkText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  filterLabel: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground, marginBottom: -spacing.xs },
  // Horizontal rows run to the screen edges and scroll under them, while their first item lines up with the page.
  bleed: { marginHorizontal: -spacing.lg },
  aisles: { gap: spacing.md, paddingHorizontal: spacing.lg },
  aisle: { width: 68, alignItems: "center", gap: 6 },
  aisleImage: { width: 58, height: 58, borderRadius: 18, padding: 7, overflow: "hidden" },
  aisleThumb: { width: "100%", height: "100%", borderRadius: 999 },
  aisleName: { fontSize: fontSize.caption, fontWeight: "600", lineHeight: 14, textAlign: "center", color: colors.foreground },
  basket: {
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.secondary, padding: spacing.lg,
  },
  basketIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  basketBody: { flex: 1, gap: 4 },
  basketTitle: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  basketText: { fontSize: fontSize.caption, lineHeight: 17, color: colors.secondaryForeground },
  basketGo: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs },
  basketGoText: { fontSize: fontSize.body, fontWeight: "800", color: colors.primary },
  footer: { gap: spacing.md, alignItems: "center" },
  trust: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { flexShrink: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground, textAlign: "center" },
  footerLinks: { flexDirection: "row", gap: spacing.lg },
  footerLink: { fontSize: fontSize.caption, color: colors.primary, fontWeight: "700" },
});

/** A basic as a product: its cheapest store's offer, with every store's price for the comparison. */
function toBasic(b: Basic): ShopProduct {
  const best = b.offers[0]!;
  return { ...fromOffer(best, best.name, best.aisle ?? "all"), compare: { offers: b.offers, inStore: b.inStore, missing: b.missing, produce: best.produce } };
}
