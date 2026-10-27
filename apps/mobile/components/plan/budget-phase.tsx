import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ArrowRight, ChevronDown, MapPin, Minus, Plus, X } from "lucide-react-native";
import { animateNextLayout, FadeIn, Pop } from "@/components/motion";
import { Button, Chip } from "@/components/ui";
import { cop, type ListItem } from "@/lib/market";
import { TRIP_COSTS } from "@/lib/planner";
import type { Frequency } from "@/lib/shop";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const MIN = 10_000;
const MAX = 10_000_000;
const FREQUENCIES: { id: Frequency; label: string; per: string }[] = [
  { id: "semanal", label: "Semanal", per: "a la semana" },
  { id: "quincenal", label: "Quincenal", per: "a la quincena" },
  { id: "mensual", label: "Mensual", per: "al mes" },
];
// Round amounts to start from, scaled to how long the purchase lasts. Shortcuts, not a judgment of what's enough.
const SUGGESTED: Record<Frequency, number[]> = {
  semanal: [100_000, 150_000, 200_000, 300_000],
  quincenal: [200_000, 300_000, 400_000, 500_000],
  mensual: [400_000, 600_000, 800_000, 1_000_000],
};
const short = (n: number) => (n >= 1_000_000 ? `$${String(n / 1_000_000).replace(".", ",")} M` : `$${n / 1000} mil`);

/** Phase 2, "Ajusta tu presupuesto": how often, how much (optional), for how many, and a few preferences. */
export function BudgetPhase({ budget, hasBudget, frequency, people, knowsPeople, tripCost, area, items, onPrefs, onItems, onArea, onNext }: {
  budget: number; hasBudget: boolean; frequency?: Frequency; people: number; knowsPeople: boolean; tripCost: number; area: string;
  items: ListItem[];
  onPrefs: (next: Partial<{ budget: number; hasBudget: boolean; frequency: Frequency; people: number; tripCost: number }>) => void;
  onItems: (items: ListItem[]) => void; onArea: () => void; onNext: (opts?: { hasBudget?: boolean }) => void;
}) {
  // The amount exactly as typed: an emptied field stays empty instead of snapping back to a number.
  const [digits, setDigits] = useState(hasBudget ? String(budget) : "");
  const [focused, setFocused] = useState(false);
  const [more, setMore] = useState(false);
  const amount = Number(digits || 0);
  const error = !hasBudget ? "" : !digits ? "Escribe cuánto quieres gastar, o sigue sin presupuesto." : amount < MIN ? `El mínimo es ${cop(MIN)}.` : amount > MAX ? `El máximo es ${cop(MAX)}.` : "";
  const flexible = items.every(i => i.allowSubstitution);
  const per = FREQUENCIES.find(f => f.id === frequency)?.per;

  function type(text: string) {
    const next = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8);
    setDigits(next);
    if (!hasBudget) onPrefs({ hasBudget: true });
    const n = Number(next);
    if (n >= MIN && n <= MAX) onPrefs({ budget: n });
  }

  function choose(n: number) {
    setDigits(String(n));
    onPrefs({ budget: n, hasBudget: true });
  }

  function noBudget(on: boolean) {
    animateNextLayout();
    onPrefs({ hasBudget: !on });
    if (!on && !digits) setDigits(String(budget));
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text accessibilityRole="header" style={styles.title}>Hagamos rendir tu presupuesto.</Text>
          <Text style={styles.lede}>Cuéntanos cuánto quieres gastar y para cuántos compras.</Text>
        </FadeIn>

        <View style={styles.block}>
          <Text style={styles.question}>¿Para cuánto tiempo compras?</Text>
          <View accessibilityRole="radiogroup" style={styles.segment}>
            {FREQUENCIES.map(f => {
              const on = frequency === f.id;
              return (
                <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onPrefs({ frequency: f.id })} style={[styles.segmentItem, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.question}>¿Cuánto quieres gastar{per ? ` ${per}` : ""}?</Text>
          <View style={[styles.money, focused && styles.moneyFocused, !hasBudget && styles.moneyOff, !!error && !focused && styles.moneyError]}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              accessibilityLabel="Presupuesto en pesos"
              keyboardType="number-pad"
              inputMode="numeric"
              value={digits ? Number(digits).toLocaleString("es-CO") : ""}
              onChangeText={type}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              editable={hasBudget}
              style={styles.moneyInput}
            />
            {hasBudget && digits ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar el presupuesto" hitSlop={8} onPress={() => setDigits("")} style={styles.clear}>
                <X size={14} color={colors.mutedForeground} />
              </Pressable>
            ) : (
              <Text style={styles.cop}>COP</Text>
            )}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {hasBudget && (
            <View style={styles.chips}>
              {SUGGESTED[frequency ?? "quincenal"].map(n => (
                <Chip key={n} selected={amount === n} onPress={() => choose(n)}>{short(n)}</Chip>
              ))}
            </View>
          )}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>No tengo un presupuesto definido</Text>
            <Switch accessibilityLabel="No tengo un presupuesto definido" value={!hasBudget} onValueChange={noBudget} trackColor={{ true: colors.primary }} thumbColor={colors.card} />
          </View>
          {!hasBudget && <Text style={styles.note}>Te mostramos lo más barato sin límite de gasto. Sin presupuesto no hay propuestas para recortar.</Text>}
        </View>

        <View style={[styles.block, styles.peopleRow]}>
          <View style={styles.peopleText}>
            <Text style={styles.question}>¿Para cuántas personas?</Text>
            <Text style={styles.note}>Solo para tu referencia; las cantidades las pones tú.</Text>
          </View>
          <View style={styles.counter}>
            <Pressable accessibilityRole="button" accessibilityLabel="Una persona menos" disabled={!knowsPeople || people <= 1} onPress={() => onPrefs({ people: people - 1 })} style={[styles.counterButton, (!knowsPeople || people <= 1) && styles.counterOff]}>
              <Minus size={16} color={colors.primary} />
            </Pressable>
            <Pop value={knowsPeople ? people : "—"} style={styles.counterValueWrap}>
              <Text accessibilityLiveRegion="polite" style={styles.counterValue}>{knowsPeople ? people : "—"}</Text>
            </Pop>
            <Pressable accessibilityRole="button" accessibilityLabel="Una persona más" disabled={knowsPeople && people >= 12} onPress={() => onPrefs({ people: knowsPeople ? people + 1 : 1 })} style={[styles.counterButton, knowsPeople && people >= 12 && styles.counterOff]}>
              <Plus size={16} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => { animateNextLayout(); setMore(!more); }} style={styles.moreHead}>
          <Text style={styles.moreTitle}>Más opciones</Text>
          <Text style={styles.moreSummary} numberOfLines={1}>{flexible ? "Marcas equivalentes" : "Marcas a tu gusto"} · parada extra {tripCost ? cop(tripCost) : "gratis"}</Text>
          <ChevronDown size={16} color={colors.mutedForeground} style={more ? styles.flip : undefined} />
        </Pressable>
        {more && (
          <View style={styles.moreBody}>
            <View style={styles.switchRow}>
              <View style={styles.peopleText}>
                <Text style={styles.switchText}>Aceptar marcas equivalentes</Text>
                <Text style={styles.note}>En toda la lista: mismo producto, la marca que rinda más. Puedes cambiarlo por producto.</Text>
              </View>
              <Switch accessibilityLabel="Aceptar marcas equivalentes" value={flexible} onValueChange={v => onItems(items.map(i => ({ ...i, allowSubstitution: v })))} trackColor={{ true: colors.primary }} thumbColor={colors.card} />
            </View>
            <Text style={styles.switchText}>¿Cuánto te cuesta ir a otra tienda?</Text>
            <Text style={styles.note}>Solo sumamos una parada si ahorra más que esto. Piensa en transporte y tiempo.</Text>
            <View style={styles.chips}>
              {TRIP_COSTS.map(n => (
                <Chip key={n} selected={tripCost === n} onPress={() => onPrefs({ tripCost: n })}>{n ? cop(n) : "Nada"}</Chip>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={onArea} style={styles.area}>
              <MapPin size={14} color={colors.primary} />
              <Text style={styles.areaText} numberOfLines={1}>Precios en línea para {area}</Text>
              <Text style={styles.areaChange}>Cambiar</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Ver dónde rinde más" disabled={!!error} onPress={() => onNext()} icon={<ArrowRight size={18} color="#FFFFFF" />} />
        {hasBudget && (
          <Pressable accessibilityRole="button" onPress={() => onNext({ hasBudget: false })} hitSlop={6} style={styles.skip}>
            <Text style={styles.skipText}>Omitir presupuesto</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8, color: colors.foreground },
  lede: { marginTop: 4, fontSize: fontSize.subhead, lineHeight: 20, color: colors.mutedForeground },
  block: { gap: spacing.sm },
  question: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  segment: { flexDirection: "row", gap: 4, borderRadius: radius.md, backgroundColor: colors.muted, padding: 4 },
  segmentItem: { flex: 1, alignItems: "center", borderRadius: radius.sm, paddingVertical: 10 },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { fontSize: fontSize.body, fontWeight: "600", color: colors.mutedForeground },
  segmentTextOn: { color: "#FFFFFF", fontWeight: "800" },
  money: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  moneyFocused: { borderColor: colors.primary, boxShadow: "0 0 0 4px rgba(33,115,77,0.14)" },
  moneyError: { borderColor: colors.accent },
  moneyOff: { opacity: 0.45 },
  currency: { fontSize: 28, fontWeight: "700", color: colors.primary },
  // The box carries the focus ring; no second browser outline inside it.
  moneyInput: { flex: 1, minWidth: 0, fontSize: 34, fontWeight: "800", letterSpacing: -1, color: colors.primary, fontVariant: ["tabular-nums"], paddingVertical: 4, ...(Platform.OS === "web" && { outlineStyle: "none" as never }) },
  clear: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  cop: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  error: { fontSize: fontSize.caption, color: colors.warnInk },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  switchText: { flexShrink: 1, fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  note: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  peopleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  peopleText: { flex: 1, gap: 2 },
  counter: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  counterButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  counterOff: { opacity: 0.35 },
  counterValueWrap: { minWidth: 28, alignItems: "center" },
  counterValue: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  moreHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  moreTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  moreSummary: { flex: 1, fontSize: fontSize.caption, color: colors.mutedForeground, textAlign: "right" },
  flip: { transform: [{ rotate: "180deg" }] },
  moreBody: { gap: spacing.sm },
  area: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  areaText: { flex: 1, fontSize: fontSize.caption, color: colors.mutedForeground },
  areaChange: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  footer: { gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  skip: { alignSelf: "center", paddingVertical: 4 },
  skipText: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
});
