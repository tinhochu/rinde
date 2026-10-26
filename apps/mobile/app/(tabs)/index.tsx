import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AppState, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  ArrowRight, BadgeCheck, Bookmark, Camera, Check, ChevronDown, ChevronRight, CircleHelp,
  Heart, Leaf, LoaderCircle, MapPin, Search, ShieldCheck, ShoppingBag, Sparkles, Wallet, X,
} from "lucide-react-native";
import { Brand, StoreLogo } from "@/components/brand";
import { Button, Chip } from "@/components/ui";
import { GroceryImage } from "@/components/grocery-image";
import { ProductCard } from "@/components/product-card";
import { useAppState } from "@/lib/app-state";
import { fetchCatalog } from "@/lib/api";
import { cop, Store, STORES } from "@/lib/market";
import { CatalogResult, CATEGORIES, fromOffer, IDEAS, photo, ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

type Request = { term: string; store: Store | "all"; category: string; nonce: number };

export default function ShopScreen() {
  const { cart, favorites, area, budget, addProduct, removeProduct, favoriteProduct, openProduct, openPlanner, openModal, externalSearch } = useAppState();
  const [, setClock] = useState(0);
  const [category, setCategory] = useState("all");
  const [store, setStore] = useState<Store | "all">("all");
  const [request, setRequest] = useState<Request>();
  const [catalog, setCatalog] = useState<CatalogResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("price");
  const { control, handleSubmit, setValue, watch } = useForm<{ search: string }>({ defaultValues: { search: "" } });
  const search = watch("search");
  const totalCount = cart.reduce((sum, line) => sum + line.count, 0);

  function browse(term: string, nextStore = store, nextCategory = category) {
    if (term.trim().length < 2 || term.length > 100) {
      toast.error("Escribe un producto de 2 a 100 caracteres.");
      return;
    }
    setRequest({ term: term.trim(), store: nextStore, category: nextCategory, nonce: Date.now() });
  }

  useEffect(() => {
    if (!externalSearch) return;
    setCategory("all");
    setStore("all");
    setValue("search", externalSearch.term);
    setRequest({ term: externalSearch.term, store: "all", category: "all", nonce: externalSearch.nonce });
  }, [externalSearch, setValue]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCatalog(undefined);
    fetchCatalog(request.term, request.store, controller.signal)
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

  function selectCategory(id: string) {
    const next = CATEGORIES.find(c => c.id === id)!;
    setCategory(id);
    setValue("search", "");
    if (id === "all") {
      setRequest(undefined);
      setCatalog(undefined);
      setError("");
      setLoading(false);
    } else browse(next.term, store, id);
  }

  function selectStore(next: Store | "all") {
    setStore(next);
    const fallback = CATEGORIES.find(c => c.id === category)?.term || "mercado";
    browse(search.trim() || fallback, next);
  }

  const liveProducts = (catalog?.offers || []).map(offer => fromOffer(offer, request?.term || "mercado", category));
  const products = [...liveProducts].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "es") : a.offer!.price - b.offer!.price));
  const ideas = category === "all" ? IDEAS.slice(0, 6) : IDEAS.filter(p => p.category === category);
  const count = (id: string) => cart.find(line => line.product.id === id)?.count || 0;
  const favorite = (id: string) => favorites.some(p => p.id === id);

  function renderProduct({ item }: { item: ShopProduct }) {
    return (
      <View style={styles.productSlot}>
        <ProductCard
          product={item}
          count={count(item.id)}
          favorite={favorite(item.id)}
          onAdd={() => addProduct(item)}
          onRemove={() => removeProduct(item.id)}
          onFavorite={() => favoriteProduct(item)}
          onOpen={() => openProduct(item)}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={request ? products : ideas}
      keyExtractor={item => item.id}
      numColumns={2}
      renderItem={renderProduct}
      columnWrapperStyle={styles.columns}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerBlock}>

          <View style={styles.header}>
            <Pressable accessibilityLabel="Volver a explorar" onPress={() => selectCategory("all")}>
              <Brand small />
            </Pressable>
            <Pressable onPress={() => openModal("area")} style={styles.areaRow}>
              <MapPin size={13} color={colors.primary} />
              <Text numberOfLines={1} style={styles.area}>{area}</Text>
              <ChevronDown size={12} color={colors.mutedForeground} />
            </Pressable>
            <View style={styles.searchRow}>
              <Search size={20} color={colors.mutedForeground} />
              <Controller
                control={control}
                name="search"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    accessibilityLabel="Buscar productos"
                    value={value}
                    onChangeText={onChange}
                    maxLength={100}
                    placeholder="¿Qué hace falta en casa?"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="search"
                    onSubmitEditing={() => {
                      void handleSubmit(v => {
                        setCategory("all");
                        browse(v.search, store, "all");
                        Keyboard.dismiss();
                      })();
                    }}
                    style={styles.searchInput}
                  />
                )}
              />
              {!!search && (
                <Pressable accessibilityLabel="Limpiar búsqueda" onPress={() => setValue("search", "")} style={styles.searchClear}>
                  <X size={15} color={colors.mutedForeground} />
                </Pressable>
              )}
              <Pressable
                accessibilityLabel="Buscar productos"
                onPress={() => {
                  void handleSubmit(v => {
                    setCategory("all");
                    browse(v.search, store, "all");
                    Keyboard.dismiss();
                  })();
                }}
                style={styles.searchGo}
              >
                <ArrowRight size={17} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={() => openModal("saved")} style={styles.headerIcon}>
                <Bookmark size={15} color={colors.mutedForeground} />
                <Text style={styles.headerIconText}>Mis listas</Text>
              </Pressable>
              <Pressable onPress={() => openModal("help")} style={styles.headerIcon}>
                <CircleHelp size={15} color={colors.mutedForeground} />
                <Text style={styles.headerIconText}>Cómo funciona</Text>
              </Pressable>
              <Pressable onPress={() => openPlanner()} style={styles.planButton}>
                <Sparkles size={15} color="#FFFFFF" />
                <Text style={styles.planButtonText}>Mi plan de ahorro</Text>
              </Pressable>
            </View>
          </View>

          {!request && (
            <View style={styles.hero}>
              <View style={styles.heroTag}>
                <Sparkles size={11} color={colors.primary} />
                <Text style={styles.heroTagText}>Tu mercado, mejor pensado</Text>
              </View>
              <Text style={styles.heroTitle}>Llena tu mesa.{"\n"}Cuida tu bolsillo.</Text>
              <Text style={styles.heroSub}>Todo lo que necesitas, con un plan para que tu plata rinda más.</Text>
              <Button title="Armar mi mercado" onPress={openPlanner} icon={<ArrowRight size={15} color="#FFFFFF" />} />
              <GroceryImage src={photo("photo-1543168256-418811576931", 850)} alt="Una compra de mercado con vegetales frescos" style={styles.heroImage} />
              <View style={styles.heroNote}>
                <Leaf size={17} color={colors.primary} />
                <View>
                  <Text style={styles.heroNoteTitle}>Más para los tuyos.</Text>
                  <Text style={styles.heroNoteText}>Sin salirte de tu presupuesto.</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Tus tiendas, en un solo lugar</Text>
              <Pressable onPress={() => selectStore("all")} style={styles.sectionLink}>
                <Text style={styles.sectionLinkText}>Comparar todas</Text>
                <ChevronRight size={13} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.storeGrid}>
              {STORES.map(name => (
                <Pressable key={name} onPress={() => selectStore(name)} style={[styles.storeRow, store === name && styles.storeRowActive]}>
                  {store === name && <Check size={14} color={colors.primary} style={styles.storeCheck} />}
                  <StoreLogo store={name} />
                  <View style={styles.storeBody}>
                    <View style={styles.storeName}>
                      <Text style={styles.storeNameText}>{name}</Text>
                      <BadgeCheck size={13} color={colors.primary} />
                    </View>
                    <Text style={styles.storeSub}>Catálogo online</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Un pasillo para cada antojo</Text>
            <FlatList
              horizontal
              data={CATEGORIES.slice(1)}
              keyExtractor={c => c.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aisles}
              renderItem={({ item: c }) => (
                <Pressable onPress={() => selectCategory(c.id)} style={styles.aisle}>
                  <View style={[styles.aisleImage, { backgroundColor: c.color }, category === c.id && styles.aisleActive]}>
                    <GroceryImage src={photo(c.image, 180)} alt="" style={styles.aisleThumb} />
                  </View>
                  <Text style={[styles.aisleName, category === c.id && styles.aisleNameActive]}>{c.name}</Text>
                </Pressable>
              )}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{request ? `Resultados para “${request.term}”` : "Los básicos de tu semana"}</Text>
            <Text style={styles.sectionSub}>
              {request ? `${store === "all" ? "Todas las tiendas" : store} · Solo precios del catálogo online` : "Agrégalos a tu lista. Verificamos los precios al crear tu plan."}
            </Text>
            {request ? (
              <View style={styles.sortRow}>
                <Chip selected={sort === "price"} onPress={() => setSort("price")}>Menor precio / empaque</Chip>
                <Chip selected={sort === "name"} onPress={() => setSort("name")}>Nombre A–Z</Chip>
              </View>
            ) : (
              <Pressable onPress={() => browse("arroz")} style={styles.sectionLink}>
                <Text style={styles.sectionLinkText}>Consultar precios</Text>
                <ChevronRight size={13} color={colors.primary} />
              </Pressable>
            )}
          </View>

          {loading && (
            <View style={styles.statusCard}>
              <View style={styles.statusTitle}>
                <LoaderCircle size={18} color={colors.primary} />
                <Text style={styles.statusTitleText}>Buscando precios reales en {store === "all" ? "Éxito, Jumbo y D1" : store}…</Text>
              </View>
              <Text style={styles.statusText}>Una respuesta de la tienda, no una estimación. Puedes seguir armando tu lista mientras consultamos.</Text>
            </View>
          )}
          {!loading && request && (error || !products.length) && (
            <View style={styles.statusCard}>
              <View style={styles.statusTitle}>
                <View style={styles.statusIcon}>
                  <ShieldCheck size={20} color={colors.primary} />
                </View>
                <Text style={styles.errorTitle}>No hay un precio verificable por ahora.</Text>
              </View>
              <Text style={styles.statusText}>{error || "Las tiendas no devolvieron productos compatibles disponibles. No mostramos precios de muestra; puedes guardar el producto y volver a consultar."}</Text>
              <View style={styles.errorActions}>
                <Button title="Volver a consultar" variant="outline" onPress={() => browse(request.term)} />
                <Button
                  title="Agregar a mi lista"
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
          {request && products.length > 0 && !loading && (
            <View style={styles.coverage}>
              <ShieldCheck size={13} color={colors.primary} />
              <Text style={styles.coverageText}>Consulta: {new Date(catalog!.checkedAt).toLocaleString("es-CO")}. Hasta 20 productos por tienda y término; no es un catálogo exhaustivo. Cobertura local por confirmar.</Text>
            </View>
          )}
          <View style={styles.photoBanner}>
            <View style={styles.photoBannerIcon}>
              <Camera size={30} strokeWidth={1.4} color={colors.photoIcon} />
            </View>
            <View style={styles.photoBannerBody}>
              <Text style={styles.photoBannerKicker}>Tu lista. Nuestra tarea.</Text>
              <Text style={styles.photoBannerTitle}>¿La tienes escrita? Pásanos una foto.</Text>
              <Text style={styles.photoBannerText}>Foto, texto o uno por uno. Revisamos contigo y buscamos dónde rinde más.</Text>
            </View>
            <Pressable onPress={() => openPlanner()} style={styles.photoBannerGo}>
              <ArrowRight size={17} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.pillars}>
            {[
              { icon: <ShieldCheck size={16} color={colors.primary} />, title: "Precios, no promesas", text: "Con tienda, hora y enlace." },
              { icon: <Wallet size={16} color={colors.primary} />, title: "Tu presupuesto manda", text: "Sin gastos escondidos." },
              { icon: <Heart size={16} color={colors.primary} />, title: "Tú eliges, siempre", text: "Un plan, no una obligación." },
            ].map(p => (
              <View key={p.title} style={styles.pillar}>
                <View style={styles.pillarIcon}>{p.icon}</View>
                <Text style={styles.pillarTitle}>{p.title}</Text>
                <Text style={styles.pillarText}>{p.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Rinde · Haz que tu plata rinda más.</Text>
            <Pressable onPress={() => openModal("privacy")}>
              <Text style={styles.footerLink}>Privacidad y tus datos</Text>
            </Pressable>
            <Text style={styles.footerText}>Con cariño, desde Colombia.</Text>
          </View>
          <View style={styles.budgetHint}>
            <ShoppingBag size={14} color={colors.primary} />
            <Text style={styles.budgetHintText}>
              {totalCount} en canasta · Presupuesto {cop(budget)}
            </Text>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  columns: { gap: spacing.lg },
  // FlatList gap only separates header / rows / footer; these space the sections inside them.
  headerBlock: { gap: spacing.xl },
  footerBlock: { gap: spacing.xl },
  productSlot: { flex: 1 },
  header: { gap: spacing.md },
  areaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: spacing.xs },
  area: { flex: 1, fontSize: fontSize.caption, fontWeight: "600" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    height: 48, borderRadius: 24, backgroundColor: colors.searchBg, paddingHorizontal: spacing.lg,
  },
  searchInput: { flex: 1, fontSize: fontSize.subhead },
  searchClear: { padding: 4 },
  searchGo: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerIcon: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerIconText: { fontSize: fontSize.small, color: colors.mutedForeground },
  planButton: {
    marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  planButtonText: { fontSize: fontSize.caption, fontWeight: "700", color: "#FFFFFF" },
  hero: { borderRadius: radius.xl, backgroundColor: colors.heroGreen, padding: spacing.xl, gap: spacing.md, overflow: "hidden" },
  heroTag: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  heroTagText: { fontSize: 8, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.3, color: colors.primary },
  heroTitle: { fontSize: 29, fontWeight: "800", lineHeight: 32, letterSpacing: -1, color: colors.heroInk },
  heroSub: { fontSize: fontSize.caption, lineHeight: 18, color: colors.heroSub, maxWidth: 330 },
  heroImage: { width: "100%", height: 170, borderRadius: radius.lg },
  heroNote: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.cream, padding: spacing.md,
  },
  heroNoteTitle: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  heroNoteText: { fontSize: fontSize.tiny, color: colors.mutedForeground },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.5 },
  sectionSub: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionLinkText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  storeGrid: { flexDirection: "row", gap: spacing.sm },
  storeRow: {
    flex: 1, alignItems: "center", gap: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm,
  },
  storeRowActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  storeCheck: { position: "absolute", top: spacing.sm, right: spacing.sm },
  storeBody: { alignItems: "center", gap: 2 },
  storeName: { flexDirection: "row", alignItems: "center", gap: 4 },
  storeNameText: { fontSize: fontSize.subhead, fontWeight: "700" },
  storeSub: { fontSize: fontSize.tiny, color: colors.mutedForeground, textAlign: "center" },
  aisles: { gap: spacing.lg },
  aisle: { width: 78, alignItems: "center", gap: spacing.sm },
  aisleImage: { width: 76, height: 76, borderRadius: 22, borderWidth: 2, borderColor: "transparent", padding: 10, overflow: "hidden" },
  aisleActive: { borderColor: colors.primary },
  aisleThumb: { width: "100%", height: "100%", borderRadius: 999 },
  aisleName: { fontSize: fontSize.small, fontWeight: "500", lineHeight: 14, textAlign: "center", color: colors.foreground },
  aisleNameActive: { color: colors.primary },
  sortRow: { flexDirection: "row", gap: spacing.sm },
  statusCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.md },
  statusTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusTitleText: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  statusText: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  statusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  errorTitle: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600" },
  errorActions: { gap: spacing.sm },
  reasons: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  coverage: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  coverageText: { flex: 1, fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  photoBanner: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    borderRadius: 20, borderWidth: 1, borderColor: colors.photoFrame,
    backgroundColor: colors.photoBg, padding: spacing.xl,
  },
  photoBannerIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
  },
  photoBannerBody: { flex: 1, gap: 4 },
  photoBannerKicker: { fontSize: fontSize.tiny, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4, color: colors.photoInk },
  photoBannerTitle: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.4 },
  photoBannerText: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  photoBannerGo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  pillars: { flexDirection: "row", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.xl },
  pillar: { flex: 1, alignItems: "center", gap: spacing.sm },
  pillarIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  pillarTitle: { fontSize: fontSize.small, fontWeight: "600", textAlign: "center" },
  pillarText: { fontSize: fontSize.tiny, lineHeight: 13, textAlign: "center", color: colors.mutedForeground },
  footer: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm },
  footerText: { fontSize: fontSize.small, color: colors.mutedForeground, textAlign: "center" },
  footerLink: { fontSize: fontSize.small, color: colors.primary, fontWeight: "600" },
  budgetHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.md,
  },
  budgetHintText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
});
