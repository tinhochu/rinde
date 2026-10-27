import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react-native";
import { StoreFilterBar } from "@/components/home/store-filter";
import { PressScale } from "@/components/motion";
import { Button, Sheet } from "@/components/ui";
import { allStores, toggleStore } from "@/lib/compare";
import { STORES, type Aisle, type Store } from "@/lib/market";
import type { SearchSort, SearchState } from "@/lib/search";
import { AISLE_NAMES, type ComparedProduct } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const SORTS: { id: SearchSort; label: string; hint: string }[] = [
  { id: "relevant", label: "Relevancia", hint: "Lo que buscaste primero, luego lo que está en más tiendas" },
  { id: "price", label: "Menor precio", hint: "El precio más bajo de cada producto, de menor a mayor" },
  { id: "stores", label: "En más tiendas", hint: "Primero lo que puedes comparar en más supermercados" },
];

type Panel = "stores" | "aisle" | "sort" | "more" | null;

/**
 * Filters over results already fetched: nothing here asks the API again. Every option comes from the
 * results themselves (their stores, aisles and brands), so no filter can promise data that isn't there.
 */
export function SearchFilterBar({ state, products, shown, onChange }: {
  state: SearchState; products: ComparedProduct[]; shown: number; onChange: (next: Partial<SearchState>) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const storeCounts = Object.fromEntries(STORES.map(s => [s, products.filter(p => p.offers.some(o => o.store === s)).length])) as Record<Store, number>;
  const aisles = tally(products.map(p => p.aisle)).sort((a, b) => Number(a[0] === "other") - Number(b[0] === "other") || b[1] - a[1]) as [Aisle, number][];
  const brands = tally(products.map(p => p.brand.trim()).filter(Boolean)).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const multiCount = products.filter(p => p.offers.length > 1).length;
  const extra = state.brands.length + Number(state.multi);
  const filtered = !allStores(state.stores) || state.aisle !== "all" || extra > 0;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
        <FilterChip active={!allStores(state.stores)} label={allStores(state.stores) ? "Todas las tiendas" : state.stores.join(" + ")} onPress={() => setPanel("stores")} />
        <FilterChip active={state.aisle !== "all"} label={state.aisle === "all" ? "Categorías" : AISLE_NAMES[state.aisle]} onPress={() => setPanel("aisle")} />
        <FilterChip active={state.sort !== "relevant"} label={SORTS.find(s => s.id === state.sort)!.label} onPress={() => setPanel("sort")} />
        <FilterChip
          active={extra > 0}
          label={extra ? `Más filtros · ${extra}` : "Más filtros"}
          icon={<SlidersHorizontal size={14} color={extra ? colors.primary : colors.foreground} />}
          onPress={() => setPanel("more")}
        />
        {filtered && (
          <PressScale accessibilityRole="button" onPress={() => onChange({ stores: [], aisle: "all", brands: [], multi: false })} style={styles.clear}>
            <X size={14} color={colors.destructive} />
            <Text style={styles.clearText}>Limpiar filtros</Text>
          </PressScale>
        )}
      </ScrollView>

      <FilterSheet visible={panel === "stores"} title="Comparar en" shown={shown} onClose={() => setPanel(null)}>
        <Text style={styles.help}>Cada tienda dice cuántos de estos productos tiene con precio online.</Text>
        <StoreFilterBar filter={state.stores} counts={storeCounts} onChange={s => onChange({ stores: toggleStore(state.stores, s) })} />
      </FilterSheet>

      <FilterSheet visible={panel === "aisle"} title="Categoría" shown={shown} onClose={() => setPanel(null)}>
        <Option label="Todas las categorías" detail={`${products.length}`} selected={state.aisle === "all"} onPress={() => onChange({ aisle: "all" })} />
        {aisles.map(([id, n]) => (
          <Option key={id} label={AISLE_NAMES[id]} detail={`${n}`} selected={state.aisle === id} onPress={() => onChange({ aisle: id })} />
        ))}
      </FilterSheet>

      <FilterSheet visible={panel === "sort"} title="Ordenar por" shown={shown} onClose={() => setPanel(null)}>
        {SORTS.map(s => (
          <Option key={s.id} label={s.label} hint={s.hint} selected={state.sort === s.id} onPress={() => { onChange({ sort: s.id }); setPanel(null); }} />
        ))}
      </FilterSheet>

      <FilterSheet visible={panel === "more"} title="Más filtros" shown={shown} onClose={() => setPanel(null)}>
        <View style={styles.toggle}>
          <View style={styles.toggleBody}>
            <Text style={styles.optionLabel}>Solo en 2 o más tiendas</Text>
            <Text style={styles.help}>{multiCount} de {products.length} productos se pueden comparar.</Text>
          </View>
          <Switch
            accessibilityLabel="Solo productos en 2 o más tiendas"
            value={state.multi}
            onValueChange={multi => onChange({ multi })}
            trackColor={{ true: colors.primary, false: colors.muted }}
            thumbColor="#FFFFFF"
          />
        </View>
        {brands.length > 0 && (
          <View style={styles.brandWrap}>
            <Text style={styles.sectionLabel}>Marca</Text>
            <View style={styles.brands}>
              {brands.map(([brand, n]) => {
                const on = state.brands.includes(brand);
                return (
                  <Pressable
                    key={brand}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => onChange({ brands: on ? state.brands.filter(b => b !== brand) : [...state.brands, brand] })}
                    style={[styles.brand, on && styles.brandOn]}
                  >
                    {on && <Check size={13} strokeWidth={2.6} color={colors.primary} />}
                    <Text style={[styles.brandText, on && styles.brandTextOn]}>{brand}</Text>
                    <Text style={styles.brandCount}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </FilterSheet>
    </>
  );
}

function tally<T extends string>(values: T[]): [T, number][] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()];
}

function FilterChip({ active, label, icon, onPress }: { active: boolean; label: string; icon?: ReactNode; onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {icon}
      <Text numberOfLines={1} style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {!icon && <ChevronDown size={14} color={active ? colors.primary : colors.mutedForeground} />}
    </PressScale>
  );
}

function FilterSheet({ visible, title, shown, onClose, children }: { visible: boolean; title: string; shown: number; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
        <Button title={shown === 1 ? "Ver 1 producto" : `Ver ${shown} productos`} onPress={onClose} />
      </View>
    </Sheet>
  );
}

function Option({ label, detail, hint, selected, onPress }: { label: string; detail?: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && styles.pressed]}>
      <View style={styles.optionBody}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{label}</Text>
        {hint && <Text style={styles.help}>{hint}</Text>}
      </View>
      {detail && <Text style={styles.optionDetail}>{detail}</Text>}
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Check size={13} strokeWidth={3} color="#FFFFFF" />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, minHeight: 38, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  chipText: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  chipTextActive: { fontWeight: "800", color: colors.primary },
  clear: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 38, paddingHorizontal: spacing.sm },
  clearText: { fontSize: fontSize.body, fontWeight: "700", color: colors.destructive },
  sheet: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetTitle: { fontSize: fontSize.title + 2, fontWeight: "800", color: colors.foreground },
  sheetBody: { maxHeight: 420 },
  sheetContent: { gap: spacing.sm },
  help: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  option: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  optionBody: { flex: 1, gap: 2 },
  optionLabel: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  optionLabelOn: { fontWeight: "800", color: colors.primary },
  optionDetail: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  toggleBody: { flex: 1, gap: 2 },
  sectionLabel: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  brandWrap: { gap: spacing.sm, paddingTop: spacing.sm },
  brands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  brand: {
    flexDirection: "row", alignItems: "center", gap: 5, minHeight: 36, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  brandOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  brandText: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  brandTextOn: { color: colors.primary, fontWeight: "800" },
  brandCount: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
});
