import { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { CalendarDays, Check, MapPin, Users, Wallet } from "lucide-react-native";
import { Chip, Stepper } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { cop } from "@/lib/market";
import { FREQUENCIES, MAX_BUDGET, MIN_BUDGET, SUGGESTED_BUDGETS } from "@/lib/planner";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { PreferenceRow, Section, Segmented } from "./rows";

const ICON = 17;

/**
 * "Mi mercado": the same zone, frequency, budget and household that "Mi plan de ahorro" uses. There is
 * one copy of each, in app state, so a change here is what the planner starts from next time.
 */
export function ShoppingPreferences() {
  const { area, budget, hasBudget, frequency, people, knowsPeople, setPrefs, openModal } = useAppState();
  const per = FREQUENCIES.find(f => f.id === frequency)?.per;
  const budgetValue = hasBudget ? `${cop(budget)}${per ? ` ${per}` : ""}` : "Sin presupuesto fijo";

  return (
    <Section title="Mi mercado" note="Mi plan de ahorro arranca con estos datos. Si los cambias allá, también cambian aquí.">
      <PreferenceRow
        icon={<MapPin size={ICON} color={colors.primary} />}
        label="Mi zona"
        value={area}
        onPress={() => openModal("area")}
        accessibilityHint="Cambia dónde haces mercado"
      />
      <PreferenceRow
        icon={<CalendarDays size={ICON} color={colors.primary} />}
        label="Frecuencia de compra"
        value={frequency ? undefined : "Sin elegir"}
        below={<Segmented label="Frecuencia de compra" options={FREQUENCIES} value={frequency} onChange={f => setPrefs({ frequency: f })} />}
      />
      <PreferenceRow icon={<Wallet size={ICON} color={colors.primary} />} label="Presupuesto habitual" value={budgetValue}>
        <BudgetEditor />
      </PreferenceRow>
      <PreferenceRow
        icon={<Users size={ICON} color={colors.primary} />}
        label="Personas en casa"
        // The stepper already shows the number; say so only when it is still the default, not a choice.
        value={knowsPeople ? undefined : "Sin definir"}
        control={
          <Stepper
            value={people}
            min={1}
            max={12}
            onMinus={() => setPrefs({ people: people - 1 })}
            onPlus={() => setPrefs({ people: people + 1 })}
            minusLabel="Una persona menos"
            plusLabel="Una persona más"
          />
        }
        last
      />
    </Section>
  );
}

/** Any amount in the plan's range, or no fixed budget. Saves on "listo", on leaving the field, or on a shortcut. */
function BudgetEditor() {
  const { budget, hasBudget, frequency, setPrefs } = useAppState();
  const [digits, setDigits] = useState(String(budget));
  const [saved, setSaved] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => setDigits(String(budget)), [budget]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  const amount = Number(digits || 0);
  const error = !hasBudget || !digits ? "" : amount < MIN_BUDGET ? `El mínimo es ${cop(MIN_BUDGET)}.` : amount > MAX_BUDGET ? `El máximo es ${cop(MAX_BUDGET)}.` : "";
  const per = FREQUENCIES.find(f => f.id === frequency)?.per;

  function save(n: number) {
    if (n < MIN_BUDGET || n > MAX_BUDGET) return;
    setPrefs({ budget: n, hasBudget: true });
    setDigits(String(n));
    setSaved(true);
  }

  return (
    <>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>No tengo un presupuesto fijo</Text>
        <Switch
          accessibilityLabel="No tengo un presupuesto fijo"
          value={!hasBudget}
          onValueChange={off => { setPrefs({ hasBudget: !off }); setSaved(true); }}
          trackColor={{ true: colors.primary, false: colors.muted }}
          thumbColor="#FFFFFF"
        />
      </View>
      {hasBudget ? (
        <>
          <View style={[styles.moneyBox, focused && styles.moneyFocused, !!error && styles.moneyError]}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              accessibilityLabel={`Presupuesto ${per ?? ""} en pesos`}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              value={digits ? Number(digits).toLocaleString("es-CO") : ""}
              onChangeText={t => setDigits(t.replace(/\D/g, "").slice(0, 8))}
              onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); if (amount !== budget) save(amount); }}
              onSubmitEditing={() => save(amount)}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={styles.moneyInput}
            />
            <Text style={styles.cop}>{per ?? "COP"}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.chips}>
            {SUGGESTED_BUDGETS[frequency ?? "quincenal"].map(n => (
              <Chip key={n} selected={budget === n} onPress={() => save(n)}>{cop(n)}</Chip>
            ))}
          </View>
          {!frequency ? <Text style={styles.help}>Elige arriba si compras cada semana, quincena o mes para que el valor tenga sentido.</Text> : null}
        </>
      ) : (
        <Text style={styles.help}>Mi plan de ahorro buscará el mercado más barato sin compararlo con un tope.</Text>
      )}
      {saved ? (
        <View accessibilityLiveRegion="polite" style={styles.saved}>
          <Check size={14} color={colors.primary} />
          <Text style={styles.savedText}>Guardado</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  switchLabel: { flex: 1, fontSize: fontSize.body, color: colors.foreground },
  moneyBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  moneyFocused: { borderColor: colors.primary },
  moneyError: { borderColor: colors.destructive },
  currency: { fontSize: 22, fontWeight: "700", color: colors.primary },
  moneyInput: {
    flex: 1, minWidth: 0, fontSize: 24, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"], paddingVertical: spacing.sm,
    ...(Platform.OS === "web" && { outlineStyle: "none" as never }),
  },
  cop: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  error: { fontSize: fontSize.small, color: colors.destructive },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  help: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  saved: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  savedText: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
});
