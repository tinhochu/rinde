import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowRight, ChevronDown, Heart, Leaf, MapPin, ShieldCheck, ShoppingBasket, Sparkles } from "lucide-react-native";
import { Button, Stepper } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { cop } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { inputStyle, labelStyle } from "@/components/ui";

const schema = z.object({
  budget: z.number().min(10000, "Empieza con al menos $10.000.").max(10000000, "El presupuesto máximo es $10.000.000."),
  people: z.number().min(1).max(12),
});
type Values = z.infer<typeof schema>;

export function BudgetStep({ budget, people, area, onArea, onNext }: {
  budget: number; people: number; area: string; onArea: () => void; onNext: (budget: number, people: number) => void;
}) {
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { budget, people },
  });
  const currentPeople = watch("people");
  const currentBudget = watch("budget");
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.heroTag}>
        <Sparkles size={13} color={colors.primary} />
        <Text style={styles.heroTagText}>Tu mercado, mejor pensado</Text>
      </View>
      <Text style={styles.hero}>Haz que tu plata{"\n"}<Text style={styles.heroAccent}>rinda más.</Text></Text>
      <Text style={styles.lede}>Tu lista de siempre. Un mercado más inteligente. Comparamos precios para que te lleves más, sin pasarte de tu presupuesto.</Text>

      <View style={styles.card}>
        <View style={styles.areaRow}>
          <MapPin size={17} color={colors.primary} />
          <Text style={styles.area} numberOfLines={1}>{area}</Text>
          <Pressable onPress={onArea} style={styles.areaChange}>
            <Text style={styles.areaChangeText}>Cambiar</Text>
            <ChevronDown size={14} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={styles.cardTitle}>Primero, tu presupuesto.</Text>
        <Text style={styles.cardSub}>¿Cuánto tienes para este mercado? Nosotros hacemos que rinda.</Text>
        <Text style={[labelStyle, styles.budgetLabel]}>Mi presupuesto para el mercado</Text>
        <View style={styles.budgetBox}>
          <Text style={styles.currency}>$</Text>
          <Controller
            control={control}
            name="budget"
            render={({ field: { onChange, value } }) => (
              <TextInput
                accessibilityLabel="Mi presupuesto para el mercado"
                keyboardType="numeric"
                value={Number(value || 0).toLocaleString("es-CO")}
                onChangeText={text => onChange(Number(text.replace(/\D/g, "")))}
                style={styles.budgetInput}
              />
            )}
          />
          <Text style={styles.cop}>COP</Text>
        </View>
        {errors.budget && <Text style={styles.error}>{errors.budget.message}</Text>}
        <View style={styles.quickRow}>
          {[100000, 200000, 300000].map(n => (
            <Pressable
              key={n}
              onPress={() => setValue("budget", n, { shouldValidate: true })}
              style={[styles.quick, Number(currentBudget) === n && styles.quickSelected]}
            >
              <Text style={[styles.quickText, Number(currentBudget) === n && styles.quickTextSelected]}>{cop(n)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.peopleRow}>
          <View style={styles.peopleText}>
            <Text style={styles.peopleTitle}>¿Para cuántas personas?</Text>
            <Text style={styles.peopleSub}>Para los que se sientan a tu mesa.</Text>
          </View>
          <Controller
            control={control}
            name="people"
            render={({ field: { onChange, value } }) => (
              <Stepper value={value} min={1} max={12} onMinus={() => onChange(value - 1)} onPlus={() => onChange(value + 1)} minusLabel="Una persona menos" plusLabel="Una persona más" />
            )}
          />
        </View>
        <Button title="Empezar mi mercado" onPress={handleSubmit(v => onNext(v.budget, v.people))} icon={<ArrowRight size={18} color="#FFFFFF" />} />
        <View style={styles.assureRow}>
          <ShieldCheck size={13} color={colors.mutedForeground} />
          <Text style={styles.assure}>Sin registro. Sin costo. Sin pasarte de tu presupuesto.</Text>
        </View>
      </View>

      <View style={styles.pillars}>
        {[
          { icon: <ShoppingBasket size={17} strokeWidth={1.6} color={colors.primary} />, title: "Tu lista, a tu manera", text: "Una foto, un texto o producto a producto." },
          { icon: <ShieldCheck size={17} strokeWidth={1.6} color={colors.primary} />, title: "Precios de verdad", text: "Verificados en las tiendas. Sin inventos." },
          { icon: <Heart size={17} strokeWidth={1.6} color={colors.primary} />, title: "Tú decides, siempre", text: "Cambios de marca que cuidan tu bolsillo." },
        ].map(p => (
          <View key={p.title} style={styles.pillar}>
            <View style={styles.pillarIcon}>{p.icon}</View>
            <View style={styles.pillarBody}>
              <Text style={styles.pillarTitle}>{p.title}</Text>
              <Text style={styles.pillarText}>{p.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.stores}>
        <Text style={styles.storesLabel}>Buscamos por ti en</Text>
        <View style={styles.storeLogos}>
          <StoreLogo store="Éxito" />
          <StoreLogo store="Jumbo" />
          <StoreLogo store="D1" />
        </View>
        <Text style={styles.storesNote}>y seguimos sumando.</Text>
      </View>

      <View style={styles.madeFor}>
        <Heart size={14} color={colors.primary} />
        <Text style={styles.madeForText}>Hecho para el bolsillo de las familias colombianas</Text>
        <Leaf size={14} color={colors.primary} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  heroTag: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.secondary, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  heroTagText: { fontSize: fontSize.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: colors.primary },
  hero: { fontSize: 40, fontWeight: "800", lineHeight: 44, letterSpacing: -1.5, color: colors.primary },
  heroAccent: { color: colors.accent },
  lede: { fontSize: 15, lineHeight: 24, color: colors.mutedForeground },
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.md,
    boxShadow: "0 4px 30px rgba(40,65,40,0.12)",
  },
  areaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: "dashed", paddingBottom: spacing.lg },
  area: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600" },
  areaChange: { flexDirection: "row", alignItems: "center", gap: 2 },
  areaChangeText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  cardTitle: { fontSize: fontSize.headline, fontWeight: "800", letterSpacing: -0.5 },
  cardSub: { fontSize: fontSize.subhead, lineHeight: 22, color: colors.mutedForeground },
  budgetLabel: { marginTop: spacing.sm },
  budgetBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.formBg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  currency: { fontSize: 28, fontWeight: "600", color: colors.primary },
  budgetInput: { flex: 1, minWidth: 0, width: "100%", fontSize: 30, fontWeight: "800", letterSpacing: -1, color: colors.primary, fontVariant: ["tabular-nums"] },
  cop: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  error: { fontSize: fontSize.caption, color: colors.destructive },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quick: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quickSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  quickText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  quickTextSelected: { color: colors.primary },
  peopleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: spacing.sm },
  peopleText: { flex: 1, gap: 4, paddingRight: spacing.md },
  peopleTitle: { fontSize: fontSize.subhead, fontWeight: "600" },
  peopleSub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  assureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  assure: { fontSize: fontSize.caption, color: colors.mutedForeground },
  pillars: { gap: spacing.lg },
  pillar: { flexDirection: "row", gap: spacing.md },
  pillarIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  pillarBody: { flex: 1, gap: 4 },
  pillarTitle: { fontSize: fontSize.caption, fontWeight: "600" },
  pillarText: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  stores: { alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", paddingTop: spacing.xl },
  storesLabel: { fontSize: fontSize.caption, color: colors.mutedForeground },
  storeLogos: { flexDirection: "row", gap: spacing.md },
  storesNote: { fontSize: fontSize.small, color: colors.mutedForeground },
  madeFor: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  madeForText: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
