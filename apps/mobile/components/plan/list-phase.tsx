import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { ArrowRight, Camera, ClipboardList, ImagePlus, ListChecks, Plus, Search, Sparkles } from "lucide-react-native";
import { animateNextLayout, FadeIn, Pop } from "@/components/motion";
import { ListEditor } from "@/components/plan/list-editor";
import { Button, inputStyle } from "@/components/ui";
import { extractPhoto, fetchCatalog } from "@/lib/api";
import { cop, parseList, quantityLabel, type ListItem } from "@/lib/market";
import { statusKey, type ItemStatus } from "@/lib/planner";
import { fromOffer, IDEAS, type CartLine, type ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

const MAX_ITEMS = 20;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Phase 1, "Arma tu mercado": search, paste or photograph the list, then edit it in place. */
export function ListPhase({ items, status, cart, onChange, onUseCart, onNext }: {
  items: ListItem[]; status: Record<string, ItemStatus>; cart: CartLine[];
  onChange: (items: ListItem[]) => void; onUseCart: () => void; onNext: () => void;
}) {
  const [method, setMethod] = useState<"search" | "paste" | "photo">("search");
  const priced = items.filter(i => status[statusKey(i.name)]?.kind === "priced").length;
  const known = items.filter(i => status[statusKey(i.name)]).length;
  const cartNew = cart.filter(l => !items.some(i => statusKey(i.name) === statusKey(l.product.term))).length;

  function add(incoming: ListItem[]) {
    const names = new Set(items.map(i => statusKey(i.name)));
    const fresh = incoming.filter(i => i.name.trim().length >= 2 && !names.has(statusKey(i.name)));
    const room = MAX_ITEMS - items.length;
    if (!fresh.length) {
      toast.error(incoming.length ? "Eso ya está en tu lista." : "No encontramos productos en ese texto.");
      return 0;
    }
    if (room <= 0) {
      toast.error(`Puedes comparar hasta ${MAX_ITEMS} productos por lista.`);
      return 0;
    }
    animateNextLayout();
    const added = fresh.slice(0, room);
    onChange([...items, ...added]);
    toast.success(added.length === 1 ? `${added[0]!.name} en tu lista.` : `${added.length} productos en tu lista.`, { duration: 1600 });
    if (fresh.length > room) toast.error(`Quedaron por fuera ${fresh.length - room}: el máximo es ${MAX_ITEMS}.`);
    return added.length;
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text accessibilityRole="header" style={styles.title}>¿Qué necesitas comprar?</Text>
          <Text style={styles.lede}>Arma tu lista como prefieras. Nosotros te ayudamos a comparar.</Text>
        </FadeIn>

        <View accessibilityRole="tablist" style={styles.methods}>
          {([
            { id: "search", label: "Buscar", icon: Search },
            { id: "paste", label: "Pegar lista", icon: ClipboardList },
            { id: "photo", label: "Subir foto", icon: Camera },
          ] as const).map(m => {
            const on = method === m.id;
            return (
              <Pressable key={m.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { animateNextLayout(); setMethod(m.id); }} style={[styles.method, on && styles.methodOn]}>
                <m.icon size={15} color={on ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.methodText, on && styles.methodTextOn]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {method === "search" && <SearchAdd onAdd={add} />}
        {method === "paste" && <PasteAdd onAdd={add} />}
        {method === "photo" && <PhotoAdd onAdd={add} />}

        {items.length === 0 ? (
          <View style={styles.starts}>
            {cart.length > 0 && (
              <Pressable accessibilityRole="button" onPress={onUseCart} style={[styles.start, styles.startPrimary]}>
                <ListChecks size={18} color={colors.primary} />
                <View style={styles.startText}>
                  <Text style={styles.startTitle}>Usar Mi lista ({cart.length})</Text>
                  <Text style={styles.startSub}>Los productos que agregaste al comparar precios.</Text>
                </View>
                <ArrowRight size={16} color={colors.primary} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => add(IDEAS.map(idea => ({ id: Crypto.randomUUID(), name: capitalize(idea.term), quantity: idea.pack, unit: idea.unit, brand: "", allowSubstitution: true })))}
              style={styles.start}
            >
              <Sparkles size={18} color={colors.accent} />
              <View style={styles.startText}>
                <Text style={styles.startTitle}>Empezar con los básicos</Text>
                <Text style={styles.startSub}>{IDEAS.slice(0, 5).map(i => i.term).join(", ")}… Los editas después.</Text>
              </View>
              <Plus size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <Pop value={items.length}>
                <Text style={styles.summaryTitle}>Tu lista tiene {items.length} {items.length === 1 ? "producto" : "productos"}</Text>
              </Pop>
              {known > 0 && (
                <Text style={styles.summarySub}>
                  En tu último plan encontramos precio para {priced} de {known}. Los nuevos se cotizan al comparar.
                </Text>
              )}
              {cartNew > 0 && (
                <Pressable onPress={onUseCart} hitSlop={6}>
                  <Text style={styles.summaryLink}>Sumar {cartNew} de Mi lista</Text>
                </Pressable>
              )}
            </View>
            <ListEditor items={items} status={status} onChange={onChange} />
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button title={items.length ? "Continuar" : "Agrega al menos un producto"} disabled={!items.length} onPress={onNext} icon={items.length ? <ArrowRight size={18} color="#FFFFFF" /> : undefined} />
      </View>
    </View>
  );
}

/** Type a product and add it; or pick one from the catalog, which keeps its brand as a preference. */
function SearchAdd({ onAdd }: { onAdd: (items: ListItem[]) => number }) {
  const [text, setText] = useState("");
  const [found, setFound] = useState<ComparedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const term = text.trim();

  useEffect(() => {
    setFound([]);
    if (term.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetchCatalog(term, "all", controller.signal)
        .then(r => setFound(r.products.filter(p => p.offers.length && p.pack > 0).slice(0, 4)))
        .catch(() => undefined)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term]);

  function addTyped() {
    const parsed = parseList(term).slice(0, 1).map(i => ({ ...i, id: Crypto.randomUUID() }));
    if (onAdd(parsed)) setText("");
    input.current?.focus();
  }

  function addProduct(p: ComparedProduct) {
    const generic = fromOffer(p.offers[0]!, term, p.aisle).term;
    if (onAdd([{ id: Crypto.randomUUID(), name: generic, quantity: p.pack, unit: p.unit, brand: p.brand, allowSubstitution: true }])) setText("");
  }

  return (
    <View style={styles.panel}>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, focused && styles.searchFocused]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            ref={input}
            accessibilityLabel="Buscar o escribir un producto"
            value={text}
            onChangeText={setText}
            onSubmitEditing={addTyped}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="done"
            submitBehavior="submit"
            placeholder="Ej. 2 kg de arroz"
            placeholderTextColor={colors.mutedForeground}
            style={styles.searchInput}
          />
          {loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar a mi lista" disabled={term.length < 2} onPress={addTyped} style={[styles.addButton, term.length < 2 && styles.addDisabled]}>
          <Plus size={20} color="#FFFFFF" />
        </Pressable>
      </View>
      {found.length > 0 && (
        <View style={styles.found}>
          <Text style={styles.foundLabel}>O elige uno del catálogo; la marca queda como preferencia:</Text>
          {found.map(p => {
            const cheapest = p.offers[0]!;
            return (
              <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`Agregar ${p.name}`} onPress={() => addProduct(p)} style={({ pressed }) => [styles.foundRow, pressed && styles.pressed]}>
                <View style={styles.foundText}>
                  <Text numberOfLines={1} style={styles.foundName}>{p.name}</Text>
                  <Text style={styles.foundMeta}>{quantityLabel(p.pack, p.unit)} · desde {cop(cheapest.price)} en {cheapest.store} · precio de catálogo</Text>
                </View>
                <Plus size={16} color={colors.primary} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PasteAdd({ onAdd }: { onAdd: (items: ListItem[]) => number }) {
  const [text, setText] = useState("");
  return (
    <View style={styles.panel}>
      <TextInput
        accessibilityLabel="Pega o escribe tu lista"
        multiline
        value={text}
        onChangeText={setText}
        placeholder={"2 litros de leche\n1 kilo de arroz\n12 huevos"}
        placeholderTextColor={colors.mutedForeground}
        textAlignVertical="top"
        style={[inputStyle, styles.textarea]}
      />
      <Text style={styles.hint}>Un producto por línea o separados por coma. Se separan con reglas de texto; revisa cantidades abajo.</Text>
      <Button
        title="Agregar a mi lista"
        variant="outline"
        disabled={!text.trim()}
        onPress={() => { if (onAdd(parseList(text).map(i => ({ ...i, id: Crypto.randomUUID() })))) setText(""); }}
        icon={<Plus size={16} color={colors.primary} />}
      />
    </View>
  );
}

function PhotoAdd({ onAdd }: { onAdd: (items: ListItem[]) => number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(fromCamera: boolean) {
    setError("");
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Necesitamos permiso para usar tus fotos.");
      return;
    }
    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (picked.canceled) return;
    const asset = picked.assets[0]!;
    if (!asset.mimeType || !ACCEPTED.includes(asset.mimeType) || (asset.fileSize && asset.fileSize > MAX_BYTES)) {
      setError("Elige una foto JPG, PNG o WebP de máximo 8 MB.");
      return;
    }
    setBusy(true);
    try {
      const result = await extractPhoto({ uri: asset.uri, mimeType: asset.mimeType, file: asset.file });
      if (!result.items.length) throw new Error("No encontramos productos legibles. Prueba otra foto o pega tu lista.");
      onAdd(result.items.map(i => ({ ...i, id: Crypto.randomUUID() })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos leer tu foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.photoRow}>
        <Button title={busy ? "Leyendo tu lista…" : "Tomar foto"} loading={busy} onPress={() => void pick(true)} icon={<Camera size={16} color="#FFFFFF" />} />
        <Button title="Galería" variant="outline" disabled={busy} onPress={() => void pick(false)} icon={<ImagePlus size={16} color={colors.primary} />} />
      </View>
      <Text style={styles.hint}>Una lista escrita a mano o impresa, con buena luz. Meta Muse lee los productos y cantidades; nunca precios. Los revisas abajo.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8, color: colors.foreground },
  lede: { marginTop: 4, fontSize: fontSize.subhead, lineHeight: 20, color: colors.mutedForeground },
  methods: { flexDirection: "row", gap: 4, borderRadius: radius.md, backgroundColor: colors.muted, padding: 4 },
  method: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.sm, paddingVertical: 9 },
  methodOn: { backgroundColor: colors.card, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
  methodText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  methodTextOn: { color: colors.primary, fontWeight: "800" },
  panel: { gap: spacing.sm },
  searchRow: { flexDirection: "row", gap: spacing.sm },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.md,
  },
  searchFocused: { borderColor: colors.primary },
  // The box shows focus; the browser's own outline would draw a second ring inside it.
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: fontSize.subhead, color: colors.foreground, ...(Platform.OS === "web" && { outlineStyle: "none" as never }) },
  addButton: { width: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  addDisabled: { opacity: 0.4 },
  found: { gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.sm },
  foundLabel: { fontSize: fontSize.caption, color: colors.mutedForeground, paddingHorizontal: 4, paddingBottom: 2 },
  foundRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.sm, padding: spacing.sm },
  pressed: { backgroundColor: colors.secondary },
  foundText: { flex: 1, minWidth: 0, gap: 2 },
  foundName: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  foundMeta: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  textarea: { minHeight: 120, fontSize: fontSize.subhead, lineHeight: 22, color: colors.foreground },
  hint: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  photoRow: { gap: spacing.sm },
  error: { borderRadius: radius.md, backgroundColor: colors.warnSurface, padding: spacing.md, fontSize: fontSize.caption, lineHeight: 17, color: colors.warnInk },
  starts: { gap: spacing.sm, marginTop: spacing.sm },
  start: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: spacing.lg,
  },
  startPrimary: { borderStyle: "solid", borderColor: colors.secondaryBorder, backgroundColor: colors.secondary },
  startText: { flex: 1, gap: 2 },
  startTitle: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  startSub: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  summary: { gap: 2, marginTop: spacing.sm },
  summaryTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  summarySub: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  summaryLink: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  footer: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
