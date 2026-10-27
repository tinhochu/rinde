import { useEffect, useRef, useState, type ReactNode } from "react";
import { FlatList, Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshCw, SearchX, ShieldCheck, WifiOff } from "lucide-react-native";
import { animateNextLayout, FadeIn } from "@/components/motion";
import { SearchFilterBar } from "@/components/search/filter-bar";
import { SearchHeader, type SearchInput } from "@/components/search/search-header";
import { SearchSuggestions } from "@/components/search/search-suggestions";
import { ResultCard, ResultCardSkeleton } from "@/components/search/result-card";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { withinStores } from "@/lib/compare";
import { normalized } from "@/lib/market";
import { forgetSearch, POPULAR, readSearch, recentSearches, rememberSearch, searchParams, useCatalog, type SearchState } from "@/lib/search";
import { fromOffer, type ComparedProduct, type ShopProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

/**
 * /search?q=arroz: results for one query, compared across stores. Query, stores, category, sort and the
 * extra filters live in the URL; results are fetched once per query and every filter works on them locally.
 */
export default function SearchScreen() {
  const state = readSearch(useLocalSearchParams());
  const { cart, favorites, addProduct, removeProduct, favoriteProduct, openProduct, offline } = useAppState();
  const input = useRef<SearchInput>(null);
  const [text, setText] = useState(state.q);
  const [editing, setEditing] = useState(!state.q);
  const [recent, setRecent] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { data, error, loading, retry } = useCatalog(state.q);

  // Browser Back/Forward changes the query under us: follow it.
  useEffect(() => { setText(state.q); setExpanded(new Set()); }, [state.q]);
  useEffect(() => {
    if (state.q) void rememberSearch(state.q).then(recentSearches).then(setRecent);
    else void recentSearches().then(setRecent);
  }, [state.q]);

  function update(next: Partial<SearchState>) {
    animateNextLayout();
    router.setParams(searchParams({ ...state, ...next }));
  }

  function submit(term = text) {
    const clean = term.trim();
    if (clean.length < 2) {
      toast.error("Escribe al menos 2 letras para buscar.");
      return;
    }
    Keyboard.dismiss();
    input.current?.blur();
    setText(clean);
    setEditing(false);
    // A new query keeps the stores and the order, but categories and brands belonged to the old results.
    if (normalized(clean) !== normalized(state.q)) update({ q: clean, aisle: "all", brands: [] });
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  // Results limited to the chosen stores, then the category, brand and "2+ stores" filters, then the order.
  // "relevant" keeps the API's order: the searched thing first, then products sold in more stores.
  const all = data?.products ?? [];
  const scoped = all.map(p => withinStores(p, state.stores)).filter((p): p is ComparedProduct => !!p)
    .map(p => ({ ...p, spread: p.offers.at(-1)!.price - p.offers[0]!.price }));
  const results = scoped
    .filter(p => state.aisle === "all" || p.aisle === state.aisle)
    .filter(p => !state.brands.length || state.brands.includes(p.brand.trim()))
    .filter(p => !state.multi || p.offers.length > 1)
    .sort((a, b) =>
      state.sort === "stores" ? b.offers.length - a.offers.length || a.offers[0]!.price - b.offers[0]!.price
        : state.sort === "price" ? a.offers[0]!.price - b.offers[0]!.price
          : 0);
  const filtered = results.length !== all.length;

  const toShop = (p: ComparedProduct): ShopProduct => ({
    ...fromOffer(p.offers[0]!, state.q, p.aisle),
    compare: { offers: p.offers, inStore: p.inStore, missing: p.missing, produce: p.produce },
  });
  const count = (id: string) => cart.find(line => line.product.id === id)?.count || 0;
  const favorite = (id: string) => favorites.some(p => p.id === id);
  function toggle(key: string) {
    animateNextLayout();
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  type Cell = ComparedProduct | "skeleton";
  const cells: Cell[] = loading ? Array<Cell>(4).fill("skeleton") : results;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <SearchHeader
        inputRef={input}
        value={text}
        autoFocus={!state.q}
        onChange={setText}
        onSubmit={() => submit()}
        onClear={() => { setText(""); setEditing(true); input.current?.focus(); }}
        onBack={back}
        onFocusChange={focused => { if (focused) setEditing(true); }}
      />

      <View style={styles.body}>
        <FlatList
          data={cells}
          keyExtractor={(item, index) => (item === "skeleton" ? `skeleton-${index}` : item.key)}
          renderItem={({ item, index }) => {
            if (item === "skeleton") return <ResultCardSkeleton />;
            const shop = toShop(item);
            return (
              <ResultCard
                product={item}
                index={index}
                count={count(shop.id)}
                favorite={favorite(shop.id)}
                expanded={expanded.has(item.key)}
                onToggle={() => toggle(item.key)}
                onOpen={() => openProduct(shop)}
                onAdd={() => addProduct(shop)}
                onRemove={() => removeProduct(shop.id)}
                onFavorite={() => favoriteProduct(shop)}
              />
            );
          }}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            state.q ? (
              <View style={styles.head}>
                <View style={styles.titleBlock}>
                  <Text accessibilityRole="header" style={styles.title}>Resultados para “{state.q}”</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.count}>
                    {loading
                      ? "Buscando precios reales en Éxito, Jumbo y D1…"
                      : error ? " "
                        : filtered ? `${results.length} de ${all.length} productos` : `${all.length} ${all.length === 1 ? "producto encontrado" : "productos encontrados"}`}
                  </Text>
                </View>
                {!loading && !error && all.length > 0 && (
                  <SearchFilterBar state={state} products={all} shown={results.length} onChange={update} />
                )}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            loading || !state.q ? undefined : error ? (
              <SearchMessage
                icon={offline ? <WifiOff size={22} color={colors.primary} /> : <RefreshCw size={22} color={colors.primary} />}
                title={offline ? "Estás sin conexión" : "No pudimos consultar las tiendas"}
                text={`${error} Tu búsqueda y tus filtros se mantienen.`}
                action={<Button title="Reintentar" onPress={retry} />}
              />
            ) : all.length === 0 ? (
              <SearchMessage
                icon={<SearchX size={22} color={colors.primary} />}
                title={`No encontramos “${state.q}”`}
                text="Prueba con una palabra más corta o más general, como “arroz” en vez de “arroz diana premium”. No mostramos precios de muestra."
                action={
                  <View style={styles.tryRow}>
                    {POPULAR.slice(0, 5).map(term => <Button key={term} title={term} variant="outline" onPress={() => submit(term)} />)}
                  </View>
                }
                reasons={data?.reasons}
              />
            ) : (
              <SearchMessage
                icon={<SearchX size={22} color={colors.primary} />}
                title="Ningún producto con estos filtros"
                text={`Hay ${all.length} productos para “${state.q}”, pero ninguno cumple todos los filtros.`}
                action={<Button title="Limpiar filtros" variant="outline" onPress={() => update({ stores: [], aisle: "all", brands: [], multi: false })} />}
              />
            )
          }
          ListFooterComponent={
            !loading && results.length > 0 && data ? (
              <View style={styles.coverage}>
                <ShieldCheck size={13} color={colors.mutedForeground} />
                <Text style={styles.coverageText}>
                  Consulta: {new Date(data.checkedAt).toLocaleString("es-CO")}. Productos iguales por código de barras o fruta y verdura por kilo. Hasta 20 por tienda; no es un catálogo completo.
                  {data.reasons.length ? `\n${data.reasons.join("\n")}` : ""}
                </Text>
              </View>
            ) : undefined
          }
        />

        {editing && (
          <FadeIn style={styles.suggest}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggestContent}>
              <SearchSuggestions
                text={text}
                recent={recent}
                onPick={term => submit(term)}
                onForget={term => void forgetSearch(term).then(setRecent)}
              />
              {!!state.q && (
                <Button title={`Ver resultados para “${state.q}”`} variant="outline" onPress={() => { Keyboard.dismiss(); setText(state.q); setEditing(false); }} />
              )}
            </ScrollView>
          </FadeIn>
        )}
      </View>
    </SafeAreaView>
  );
}

function SearchMessage({ icon, title, text, action, reasons }: { icon: ReactNode; title: string; text: string; action?: ReactNode; reasons?: string[] }) {
  return (
    <FadeIn style={styles.message}>
      <View style={styles.messageIcon}>{icon}</View>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageText}>{text}</Text>
      {action}
      {reasons?.length ? <Text style={styles.reasons}>Respuesta de las tiendas: {reasons.join(" · ")}</Text> : null}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  head: { gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  titleBlock: { gap: 2 },
  title: { fontSize: fontSize.headline - 2, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
  count: { fontSize: fontSize.body, color: colors.mutedForeground },
  suggest: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  suggestContent: { padding: spacing.lg, gap: spacing.xl },
  message: { alignItems: "flex-start", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl },
  messageIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  messageTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  messageText: { fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  tryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reasons: { fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
  coverage: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.sm },
  coverageText: { flex: 1, fontSize: fontSize.small, lineHeight: 16, color: colors.mutedForeground },
});
