import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bookmark, Car, ChevronRight, CircleHelp, Lock, MapPin, ShieldCheck, UserRound, Users, Wallet } from "lucide-react-native";
import { Brand } from "@/components/brand";
import { Chip, Stepper } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { cop } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const BUDGETS = [100000, 150000, 200000, 300000, 400000];
const TRIP_COSTS = [0, 5000, 10000, 15000, 20000];

export default function ProfileScreen() {
  const { area, budget, people, tripCost, saved, setPrefs, openModal } = useAppState();

  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Brand small />
      </View>

      <View style={styles.account}>
        <View style={styles.avatar}>
          <UserRound size={26} color={colors.primary} />
        </View>
        <View style={styles.accountBody}>
          <Text style={styles.accountTitle}>Estás usando Rinde sin cuenta</Text>
          <Text style={styles.accountText}>
            Tus listas, favoritos y preferencias se guardan solo en este dispositivo. Muy pronto podrás crear tu cuenta para tenerlos en tu celular y en la web, con tu historial de planes.
          </Text>
        </View>
      </View>

      <Section title="Tu mercado">
        <Row icon={<MapPin size={18} color={colors.primary} />} label="Tu zona" value={area} onPress={() => openModal("area")} />
        <View style={styles.setting}>
          <SettingTitle icon={<Wallet size={18} color={colors.primary} />} label="Presupuesto habitual" value={cop(budget)} />
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

      <Section title="Tus listas y ayuda">
        <Row icon={<Bookmark size={18} color={colors.primary} />} label="Mis listas" value={saved ? `${saved.items.length} productos` : "Ninguna guardada"} onPress={() => openModal("saved")} />
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
  account: {
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
    borderRadius: radius.lg, backgroundColor: colors.secondary, padding: spacing.lg,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  accountBody: { flex: 1, gap: 4 },
  accountTitle: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary },
  accountText: { fontSize: fontSize.caption, lineHeight: 19, color: colors.secondaryForeground },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  setting: { padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 0 },
  settingTitle: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  label: { flexShrink: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  value: { marginLeft: "auto", fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
  help: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.muted },
  rowLabel: { flex: 1 },
  rowValue: { flexShrink: 1, maxWidth: "50%", textAlign: "right", fontSize: fontSize.caption, color: colors.mutedForeground },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { fontSize: fontSize.small, color: colors.mutedForeground, textAlign: "center" },
});
