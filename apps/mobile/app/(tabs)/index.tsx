import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { AppState, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { ArrowRight, ChevronDown, ChevronRight, LoaderCircle, MapPin, ShieldCheck, ShoppingCart } from "lucide-react-native";
import { Brand } from "@/components/brand";
import { Button, Chip } from "@/components/ui";
import { GroceryImage } from "@/components/grocery-image";
import { BasicRow, BasicRowSkeleton } from "@/components/basic-row";
import { CompareCard, CompareCardSkeleton } from "@/components/compare-card";
import { FeaturedCompare, FeaturedEmpty, FeaturedSkeleton } from "@/components/home/featured-compare";
import { QuickActions } from "@/components/home/quick-actions";
import { SearchField } from "@/components/home/search-field";
import { StoreFilterBar } from "@/components/home/store-filter";
import { animateNextLayout, FadeIn, PressScale } from "@/components/motion";
import { useAppState } from "@/lib/app-state";
import { fetchCatalog } from "@/lib/api";
import { fetchBasics, type Basic } from "@/lib/basket";
import { allStores, savings, toggleStore, withinStores, type StoreFilter } from "@/lib/compare";
import { topPicks } from "@/lib/history";
import { Aisle, cop, Store, STORES } from "@/lib/market";
import { AISLE_NAMES, CatalogResult, CATEGORIES, ComparedProduct, fromOffer, IDEAS, photo, ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

type Request = { term: string; category: string; nonce: number };

/** Shown in "Compara en segundos" when the person's own staples have no product priced at two stores. */
const FEATURED_TERM = "leche entera";

export default function ShopScreen() {
  const { cart, favorites, area, budget, addProduct, removeProduct, favoriteProduct, openProduct, openPlanner, openModal, externalSearch } = useAppState();
  const [, setClock] = useState(0);
  const [category, setCategory] = useState("all");
  // Which stores to compare. Filtering happens here, on results already fetched for every store.
  const [stores, setStores] = useState<StoreFilter>([]);
  const [request, setRequest] = useState<Request>();
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
  const [catalog, setCatalog] = useState<CatalogResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("relevant");
  const [aisle, setAisle] = useState<Aisle | "all">("all");
  const { control, handleSubmit, setValue, watch } = useForm<{ search: string }>({ defaultValues: { search: "" } });
  const search = watch("search");
  const totalCount = cart.reduce((sum, line) => sum + line.count, 0);

  function browse(term: string, nextCategory = category) {
    setAisle("all");
    if (term.trim().length < 2 || term.length > 100) {
      toast.error("Escribe un producto de 2 a 100 caracteres.");
      return;
    }
    setRequest({ term: term.trim(), category: nextCategory, nonce: Date.now() });
  }

  useEffect(() => {
    if (!externalSearch) return;
    setCategory("all");
    setValue("search", externalSearch.term);
    setRequest({ term: externalSearch.term, category: "all", nonce: externalSearch.nonce });
  }, [externalSearch, setValue]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCatalog(undefined);
    fetchCatalog(request.term, "all", controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No hay conexión con el catálogo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  useEffect(() => {
    const tick = () => {
      setClock(value => value + 1);
      void NetInfo.fetch().then(state => {
        const lastChecked = Math.max(request?.nonce || 0, catalog ? new Date(catalog.checkedAt).getTime() : 0);
        if (request && !loading && state.isConnected && AppState.currentState === "active" && Date.now() - lastChecked >= 5 * 60000) {
          setRequest(previous => (previous ? { ...previous, nonce: Date.now() } : previous));
        }
      });
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [request, catalog, loading]);

  function goHome() {
    setCategory("all");
    setValue("search", "");
    setRequest(undefined);
    setCatalog(undefined);
    setError("");
    setLoading(false);
  }

  function selectCategory(id: string) {
    if (id === category) return goHome();
    setCategory(id);
    setValue("search", "");
    browse(CATEGORIES.find(c => c.id === id)!.term, id);
  }

  function selectStore(store: Store | "all") {
    animateNextLayout();
    setStores(previous => toggleStore(previous, store));
  }

  function submitSearch() {
    void handleSubmit(v => {
      setCategory("all");
      browse(v.search, "all");
      Keyboard.dismiss();
    })();
  }

  // Search results limited to the chosen stores, each product still matched across stores by barcode or produce item.
  // "relevant" keeps the API's order: the searched thing first, then products sold in more stores.
  const scoped = (catalog?.products || []).map(p => withinStores(p, stores)).filter((p): p is ComparedProduct => !!p)
    .map(p => ({ ...p, spread: p.offers.at(-1)!.price - p.offers[0]!.price }));
  const compared = [...scoped].sort((a, b) =>
    sort === "stores" ? b.offers.length - a.offers.length || a.offers[0]!.price - b.offers[0]!.price
      : sort === "price" ? a.offers[0]!.price - b.offers[0]!.price
        : 0,
  );

  // A search for "manzana" spans fruit, sodas and fabric softener; the aisle chips split them.
  const aisles = Object.entries(
    compared.reduce<Partial<Record<Aisle, number>>>((acc, p) => ({ ...acc, [p.aisle]: (acc[p.aisle] || 0) + 1 }), {}),
  ).sort(([a, x], [b, y]) => Number(a === "other") - Number(b === "other") || y! - x!) as [Aisle, number][];
  const visible = aisle === "all" ? compared : compared.filter(p => p.aisle === aisle);

  const toShop = (p: ComparedProduct, offer = p.offers[0]!): ShopProduct => ({
    ...fromOffer(offer, request?.term || p.name, category),
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
  const searching = !!request || loading;

  // How many of the products on screen each store has a price for, so thin coverage is visible on its chip.
  const counted = searching ? (catalog?.products || []).filter(p => aisle === "all" || p.aisle === aisle) : personal ? mine.map(p => p.compare).filter(Boolean) : [];
  const counts = (searching ? !loading && !!catalog : personal)
    ? Object.fromEntries(STORES.map(s => [s, counted.filter(p => p!.offers.some(o => o.store === s)).length])) as Record<Store, number>
    : undefined;

  const multi = compared.filter(p => p.offers.length > 1);
  const widest = Math.max(0, ...multi.map(p => p.spread));
  const storeNames = allStores(stores) ? "Éxito, Jumbo y D1" : stores.join(" y ");
  const summary = [
    `${compared.length} productos`,
    stores.length === 1 ? `en ${stores[0]}` : `${multi.length} con precio en 2 o más tiendas`,
    widest > 0 ? `hasta ${cop(widest)} de diferencia` : "",
  ].filter(Boolean).join(" · ");

  type Cell = ShopProduct | ComparedProduct | "skeleton";
  const shown: Cell[] = loading ? Array<Cell>(3).fill("skeleton") : request ? visible : mineLoaded || !personal ? basics : Array<Cell>(4).fill("skeleton");

  function renderProduct({ item, index }: { item: Cell; index: number }) {
    if (item === "skeleton") return searching ? <CompareCardSkeleton /> : <BasicRowSkeleton />;
    if ("offers" in item) {
      const shop = toShop(item);
      return (
        <FadeIn index={index}>
          <CompareCard
            product={item}
            count={count(shop.id)}
            favorite={favorite(shop.id)}
            onAdd={() => addProduct(shop)}
            onRemove={() => removeProduct(shop.id)}
            onFavorite={() => favoriteProduct(shop)}
            onOpen={() => openProduct(shop)}
          />
        </FadeIn>
      );
    }
    return (
      <BasicRow
        product={item}
        index={index}
        count={count(item.id)}
        favorite={favorite(item.id)}
        onOpen={() => openProduct(item)}
        onAdd={() => addProduct(item)}
        onRemove={() => removeProduct(item.id)}
        onFavorite={() => favoriteProduct(item)}
        onLookup={() => { setValue("search", item.term); browse(item.term, "all"); }}
      />
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(item, index) => (item !== "skeleton" ? ("offers" in item ? item.key : item.id) : `skeleton-${index}`)}
      renderItem={renderProduct}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <View style={styles.top}>
            <View style={styles.topBar}>
              <Pressable accessibilityLabel="Volver al inicio" onPress={goHome}>
                <Brand small />
              </Pressable>
              <PressScale accessibilityRole="button" accessibilityLabel={`Tu zona: ${area}. Cambiar`} onPress={() => openModal("area")} style={styles.area}>
                <MapPin size={14} color={colors.primary} />
                <Text numberOfLines={1} style={styles.areaText}>{area.split(",")[0]}</Text>
                <ChevronDown size={13} color={colors.mutedForeground} />
              </PressScale>
            </View>
            {!searching && (
              <View style={styles.intro}>
                <Text accessibilityRole="header" style={styles.headline}>Tu mercado, al mejor precio.</Text>
                <Text style={styles.lede}>Compara supermercados y descubre dónde ahorrar.</Text>
              </View>
            )}
            <Controller
              control={control}
              name="search"
              render={({ field: { onChange, value } }) => (
                <SearchField
                  value={value}
                  onChange={onChange}
                  onSubmit={submitSearch}
                  onClear={() => (request ? goHome() : setValue("search", ""))}
                  onSuggest={term => { setValue("search", term); setCategory("all"); browse(term, "all"); Keyboard.dismiss(); }}
                />
              )}
            />
            {!searching && (
              <QuickActions
                onList={() => openPlanner()}
                onReceipt={() => toast.success("Muy pronto podrás escanear tu factura y ganar puntos por cada precio que compartas.")}
              />
            )}
          </View>

          {!searching && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Compara en segundos</Text>
                {featured && (
                  <Pressable onPress={() => { setValue("search", featured.term); browse(featured.term, "all"); }} hitSlop={8} style={styles.sectionLink}>
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
                  onSearch={() => { setValue("search", FEATURED_TERM); browse(FEATURED_TERM, "all"); }}
                  onAllStores={() => selectStore("all")}
                />
              )}
            </View>
          )}

          <View style={styles.section}>
            {!searching && <Text style={styles.filterLabel}>Comparar en</Text>}
            <StoreFilterBar filter={stores} counts={counts} onChange={selectStore} />
          </View>

          {!searching && (
            <FlatList
              horizontal
              style={styles.bleed}
              data={CATEGORIES.slice(1)}
              keyExtractor={c => c.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aisles}
              renderItem={({ item: c }) => (
                <PressScale accessibilityRole="button" accessibilityLabel={`Comparar ${c.name}`} onPress={() => selectCategory(c.id)} style={styles.aisle}>
                  <View style={[styles.aisleImage, { backgroundColor: c.color }, category === c.id && styles.aisleActive]}>
                    <GroceryImage src={photo(c.image, 140)} alt="" style={styles.aisleThumb} />
                  </View>
                  <Text numberOfLines={2} style={[styles.aisleName, category === c.id && styles.aisleNameActive]}>{c.name}</Text>
                </PressScale>
              )}
            />
          )}

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {request ? `Resultados para “${request.term}”` : personal ? "Lo que compras seguido" : "Los básicos de tu semana"}
            </Text>
            {searching ? (
              <>
                {!loading && compared.length > 0 && <Text style={styles.sectionSub}>{summary}</Text>}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={[styles.chipRow, styles.chipRowBleed]}>
                  <Chip selected={aisle === "all"} onPress={() => setAisle("all")}>{`Todo · ${compared.length}`}</Chip>
                  {aisles.map(([id, n]) => (
                    <Chip key={id} selected={aisle === id} onPress={() => setAisle(id)}>{`${AISLE_NAMES[id]} · ${n}`}</Chip>
                  ))}
                </ScrollView>
                {request && (
                  <View style={styles.chipRow}>
                    <Chip selected={sort === "relevant"} onPress={() => setSort("relevant")}>Relevantes</Chip>
                    <Chip selected={sort === "stores"} onPress={() => setSort("stores")}>En más tiendas</Chip>
                    <Chip selected={sort === "price"} onPress={() => setSort("price")}>Menor precio</Chip>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.sectionSub}>
                {personal
                  ? "De tus facturas y lo que eliges al buscar, con el precio más bajo de hoy."
                  : "Ideas para empezar: toca uno para ver su precio de hoy. Cuando busques o agregues productos, aquí verás los tuyos."}
              </Text>
            )}
          </View>

          {loading && (
            <View accessibilityLiveRegion="polite" style={styles.statusTitle}>
              <LoaderCircle size={16} color={colors.primary} />
              <Text style={styles.statusTitleText}>Buscando precios reales en {storeNames}…</Text>
            </View>
          )}
          {!loading && request && (error || !compared.length) && (
            <View style={styles.statusCard}>
              <View style={styles.statusTitle}>
                <View style={styles.statusIcon}>
                  <ShieldCheck size={20} color={colors.primary} />
                </View>
                <Text style={styles.errorTitle}>No hay un precio verificable por ahora.</Text>
              </View>
              <Text style={styles.statusText}>
                {error || (catalog?.products.length && !allStores(stores)
                  ? `${storeNames} no tiene este producto en su catálogo online. Prueba con todas las tiendas.`
                  : "Las tiendas no devolvieron productos compatibles disponibles. No mostramos precios de muestra; puedes guardar el producto y volver a consultar.")}
              </Text>
              <View style={styles.errorActions}>
                {catalog?.products.length && !allStores(stores) ? (
                  <Button title="Comparar en todas las tiendas" variant="outline" onPress={() => selectStore("all")} />
                ) : (
                  <Button title="Volver a consultar" variant="outline" onPress={() => browse(request.term)} />
                )}
                <Button
                  title="Agregar a mi carrito"
                  onPress={() => addProduct({ id: `search-${request.term}`, name: request.term, term: request.term, image: "", pack: 1, unit: "und", brand: "", category } as ShopProduct)}
                  icon={<ArrowRight size={13} color="#FFFFFF" />}
                />
              </View>
              {catalog?.reasons.length ? (
                <Text style={styles.reasons}>Respuesta de las tiendas: {catalog.reasons.join(" · ")}</Text>
              ) : null}
            </View>
          )}
        </View>
      }
      ListFooterComponent={
        <View style={styles.footerBlock}>
          {request && compared.length > 0 && !loading && (
            <View style={styles.coverage}>
              <ShieldCheck size={13} color={colors.primary} />
              <Text style={styles.coverageText}>Consulta: {new Date(catalog!.checkedAt).toLocaleString("es-CO")}. Hasta 20 productos por tienda y término; no es un catálogo exhaustivo. Cobertura local por confirmar.{catalog!.reasons.length ? `\n${catalog!.reasons.join("\n")}` : ""}</Text>
            </View>
          )}
          {!searching && (
            <>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={totalCount ? "Comparar mi carrito en cada tienda" : "Crear mi lista para comparar"}
                onPress={() => (totalCount ? router.push("/cart") : openPlanner())}
                scaleTo={0.985}
                style={styles.basket}
              >
                <View style={styles.basketIcon}>
                  <ShoppingCart size={22} color={colors.primary} />
                </View>
                <View style={styles.basketBody}>
                  <Text style={styles.basketTitle}>¿Dónde sale más barato tu mercado?</Text>
                  <Text style={styles.basketText}>
                    {totalCount
                      ? `Tienes ${totalCount} ${totalCount === 1 ? "producto" : "productos"}. Mira el total en cada tienda, contando los que le faltan a cada una.`
                      : "Arma tu lista y sumamos el total en Éxito, Jumbo y D1, contando los productos que le faltan a cada una."}
                  </Text>
                  <View style={styles.basketGo}>
                    <Text style={styles.basketGoText}>{totalCount ? "Comparar mi carrito" : "Crear mi lista"}</Text>
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
                  <Pressable onPress={() => openModal("saved")} hitSlop={8}><Text style={styles.footerLink}>Mis listas</Text></Pressable>
                  <Pressable onPress={() => openModal("privacy")} hitSlop={8}><Text style={styles.footerLink}>Privacidad</Text></Pressable>
                </View>
              </View>
            </>
          )}
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
  aisleImage: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: "transparent", padding: 7, overflow: "hidden" },
  aisleActive: { borderColor: colors.primary },
  aisleThumb: { width: "100%", height: "100%", borderRadius: 999 },
  aisleName: { fontSize: fontSize.caption, fontWeight: "600", lineHeight: 14, textAlign: "center", color: colors.foreground },
  aisleNameActive: { color: colors.primary },
  chipRow: { flexDirection: "row", gap: spacing.sm },
  chipRowBleed: { paddingHorizontal: spacing.lg },
  statusCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.md },
  statusTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusTitleText: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  statusText: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  statusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  errorTitle: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  errorActions: { gap: spacing.sm },
  reasons: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  coverage: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  coverageText: { flex: 1, fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
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
