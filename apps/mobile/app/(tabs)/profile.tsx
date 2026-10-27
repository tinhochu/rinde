import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Bookmark, Car, ChevronRight, CircleHelp, Lock, MapPin, Palette, ShieldCheck, UserRound, Users, Wallet } from "lucide-react-native";
import { router } from "expo-router";
import { Brand } from "@/components/brand";
import { Button, Chip, Stepper } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { useAppState } from "@/lib/app-state";
import { cop } from "@/lib/market";
import { colors, fontSize, radius, spacing, themePref } from "@/lib/theme";
import { saveThemePref, type ThemePref } from "@/lib/theme-pref";
import { toast } from "@/lib/toast";

const BUDGETS = [100000, 150000, 200000, 300000, 400000];
const TRIP_COSTS = [0, 5000, 10000, 15000, 20000];
const THEMES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "Como tu celular" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
];

function chooseTheme(next: ThemePref) {
  if (next === themePref) return;
  if (!saveThemePref(next)) toast.success("Listo. Verás el cambio la próxima vez que abras Rinde.");
}

export default function ProfileScreen() {
  const { area, budget, people, tripCost, saved, setPrefs, openModal } = useAppState();

  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Brand small />
      </View>

      <AccountCard />

      <Section title="Tu mercado">
        <Row icon={<MapPin size={18} color={colors.primary} />} label="Tu zona" value={area} onPress={() => openModal("area")} />
        <View style={styles.setting}>
          <SettingTitle icon={<Wallet size={18} color={colors.primary} />} label="Presupuesto habitual" />
          <BudgetInput value={budget} onChange={n => setPrefs({ budget: n })} />
          <View style={styles.chips}>
            {BUDGETS.map(n => (
              <Chip key={n} selected={budget === n} onPress={() => setPrefs({ budget: n })}>{cop(n)}</Chip>
            ))}
          </View>
        </View>
        <View style={[styles.setting, styles.settingRow]}>
          <SettingTitle icon={<Users size={18} color={colors.primary} />} label="Personas en tu mesa" />
          <Stepper
            value={people}
            min={1}
            max={12}
            onMinus={() => setPrefs({ people: people - 1 })}
            onPlus={() => setPrefs({ people: people + 1 })}
            minusLabel="Una persona menos"
            plusLabel="Una persona más"
          />
        </View>
      </Section>

      <Section title="Apariencia">
        <View style={styles.setting}>
          <SettingTitle icon={<Palette size={18} color={colors.primary} />} label="Tema" value={THEMES.find(t => t.id === themePref)!.label} />
          <View style={styles.chips}>
            {THEMES.map(t => (
              <Chip key={t.id} selected={themePref === t.id} onPress={() => chooseTheme(t.id)}>{t.label}</Chip>
            ))}
          </View>
        </View>
      </Section>

      <Section title="Tus vueltas">
        <View style={styles.setting}>
          <SettingTitle icon={<Car size={18} color={colors.primary} />} label="¿Cuánto te cuesta ir a otra tienda?" value={tripCost ? cop(tripCost) : "Nada"} />
          <Text style={styles.help}>Solo te proponemos una parada extra si ahorras más que esto. Piensa en el transporte y tu tiempo.</Text>
          <View style={styles.chips}>
            {TRIP_COSTS.map(n => (
              <Chip key={n} selected={tripCost === n} onPress={() => setPrefs({ tripCost: n })}>{n ? cop(n) : "Nada"}</Chip>
            ))}
          </View>
        </View>
      </Section>

      <Section title="Tus planes y ayuda">
        <Row icon={<Bookmark size={18} color={colors.primary} />} label="Planes guardados" value={saved ? `${saved.items.length} productos` : "Ninguno guardado"} onPress={() => openModal("saved")} />
        <Row icon={<CircleHelp size={18} color={colors.primary} />} label="Cómo funciona" onPress={() => openModal("help")} />
        <Row icon={<Lock size={18} color={colors.primary} />} label="Privacidad y tus datos" onPress={() => openModal("privacy")} last />
      </Section>

      <View style={styles.footer}>
        <ShieldCheck size={13} color={colors.mutedForeground} />
        <Text style={styles.footerText}>Sin registro obligatorio. Solo precios observados en las tiendas.</Text>
      </View>
    </ScrollView>
  );
}

/** Signed out: what an account adds and the way in. Signed in: who you are and the way out. */
function AccountCard() {
  const { user, loading, signOut } = useAccount();
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      await signOut();
      toast.success("Cerraste sesión. Tus puntos siguen en tu cuenta.");
    } catch {
      toast.error("No pudimos cerrar sesión. Inténtalo de nuevo.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <View style={styles.account}>
      <View style={styles.accountTop}>
        <View style={styles.avatar}>
          <UserRound size={26} color={colors.primary} />
        </View>
        <View style={styles.accountBody}>
          {user ? (
            <>
              <Text style={styles.accountTitle}>{user.name || "Tu cuenta"}</Text>
              <Text style={styles.accountText}>{user.email}</Text>
              <Text style={styles.accountText}>Tus puntos y facturas quedan guardados en tu cuenta.</Text>
            </>
          ) : (
            <>
              <Text style={styles.accountTitle}>Estás usando Rinde sin cuenta</Text>
              <Text style={styles.accountText}>
                Todo funciona igual. Con una cuenta, tus puntos y facturas no se pierden si cambias de celular y los ves también en la web.
              </Text>
            </>
          )}
        </View>
      </View>
      {user ? (
        <Button title="Cerrar sesión" variant="outline" loading={leaving} onPress={leave} />
      ) : (
        <Button title="Crear cuenta o entrar" disabled={loading} onPress={() => router.push("/account")} />
      )}
    </View>
  );
}

const MIN_BUDGET = 10000;
const MAX_BUDGET = 10000000;

/** Any amount, typed; the chips below are shortcuts. Saved when the field loses focus or on "listo". */
function BudgetInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(value.toLocaleString("es-CO"));
  const [error, setError] = useState("");
  useEffect(() => setText(value.toLocaleString("es-CO")), [value]);

  function commit() {
    const n = Number(text.replace(/\D/g, ""));
    if (n < MIN_BUDGET || n > MAX_BUDGET) {
      setError(n < MIN_BUDGET ? `Escribe al menos ${cop(MIN_BUDGET)}.` : `El máximo es ${cop(MAX_BUDGET)}.`);
      setText(value.toLocaleString("es-CO"));
      return;
    }
    setError("");
    if (n !== value) onChange(n);
    else setText(n.toLocaleString("es-CO"));
  }

  return (
    <View style={styles.budgetWrap}>
      <View style={styles.budgetBox}>
        <Text style={styles.budgetCurrency}>$</Text>
        <TextInput
          accessibilityLabel="Presupuesto habitual en pesos"
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          value={text}
          onChangeText={t => { setError(""); setText(Number(t.replace(/\D/g, "") || 0).toLocaleString("es-CO")); }}
          onBlur={commit}
          onSubmitEditing={commit}
          style={styles.budgetInput}
        />
        <Text style={styles.budgetCop}>COP</Text>
      </View>
      {error ? <Text style={styles.budgetError}>{error}</Text> : <Text style={styles.help}>Escribe cualquier valor o elige uno rápido.</Text>}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SettingTitle({ icon, label, value }: { icon: ReactNode; label: string; value?: string }) {
  return (
    <View style={styles.settingTitle}>
      {icon}
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
    </View>
  );
}

function Row({ icon, label, value, onPress, last }: { icon: ReactNode; label: string; value?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}>
      {icon}
      <Text style={[styles.label, styles.rowLabel]}>{label}</Text>
      {value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center" },
  account: { gap: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.secondary, padding: spacing.lg },
  accountTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  accountBody: { flex: 1, gap: 4 },
  accountTitle: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary },
  accountText: { fontSize: fontSize.caption, lineHeight: 19, color: colors.secondaryForeground },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  setting: { padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 0 },
  settingTitle: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  label: { flexShrink: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  value: { marginLeft: "auto", fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
  help: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  budgetWrap: { gap: 6 },
  budgetBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, minHeight: 52,
  },
  budgetCurrency: { fontSize: 22, fontWeight: "600", color: colors.primary },
  budgetInput: { flex: 1, minWidth: 0, fontSize: 24, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"], paddingVertical: spacing.sm },
  budgetCop: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  budgetError: { fontSize: fontSize.small, color: colors.destructive },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.muted },
  rowLabel: { flex: 1 },
  rowValue: { flexShrink: 1, maxWidth: "50%", textAlign: "right", fontSize: fontSize.caption, color: colors.mutedForeground },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { fontSize: fontSize.small, color: colors.mutedForeground, textAlign: "center" },
});
