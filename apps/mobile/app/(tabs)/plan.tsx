import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, Bookmark, Check, ChevronRight, MapPin, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react-native";
import { Brand } from "@/components/brand";
import { BudgetStep } from "@/components/plan/budget-step";
import { ListStep } from "@/components/plan/list-step";
import { ReviewStep } from "@/components/plan/review-step";
import { PlanStep } from "@/components/plan/plan-step";
import { VerifyProgressRows } from "@/components/plan/verify-progress";
import { useAppState } from "@/lib/app-state";
import { cop } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const STEPS = ["Presupuesto", "Tu lista", "Revisamos", "Precios", "Tu plan"];

export default function PlanScreen() {
  const { step, go, budget, people, area, items, result, progress, refreshing, deciding, fromCart, setBudgetPeople, setItems, compare, refresh, decide, explore, openModal } = useAppState();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Rinde, explorar productos" onPress={explore}>
          <Brand small />
        </Pressable>
        <Pressable onPress={() => openModal("saved")} style={styles.savedButton}>
          <Bookmark size={16} color={colors.mutedForeground} />
          <Text style={styles.savedText}>Mis listas</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Pressable onPress={explore} style={styles.metaLink}>
          <ArrowLeft size={13} color={colors.primary} />
          <Text style={styles.metaLinkText}>Seguir explorando</Text>
        </Pressable>
        <Pressable onPress={() => openModal("area")} style={styles.metaArea}>
          <MapPin size={12} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={styles.metaAreaText}>{area}</Text>
          <ChevronRight size={12} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View accessibilityLabel="Progreso de tu plan" style={styles.progress}>
        {STEPS.map((label, index) => {
          const disabled = index > step || step === 3 || index === 3 || (index === 4 && !result);
          return (
            <View key={label} style={[styles.progressItem, index < STEPS.length - 1 && styles.progressGrow]}>
              <Pressable accessibilityLabel={`Paso ${index + 1}: ${label}`} disabled={disabled} onPress={() => go(index)} style={styles.progressButton}>
                <View style={[styles.dot, index === step && styles.dotActive, index < step && styles.dotDone, index > step && styles.dotTodo]}>
                  {index < step ? <Check size={13} color={colors.primary} /> : <Text style={[styles.dotText, index === step && styles.dotTextActive]}>{index + 1}</Text>}
                </View>
              </Pressable>
              {index < STEPS.length - 1 && <View style={styles.progressLine} />}
            </View>
          );
        })}
      </View>

      {/* Five step labels don't fit a phone-width bar, so the current one is named here. */}
      <Text style={styles.stepName}>Paso {step + 1} de {STEPS.length} · <Text style={styles.stepNameStrong}>{STEPS[step]}</Text></Text>

      {step > 0 && step !== 3 && (
        <Pressable onPress={() => go(step === 4 ? 2 : step === 2 && fromCart ? 0 : step - 1)} style={styles.back}>
          <ArrowLeft size={14} color={colors.mutedForeground} />
          <Text style={styles.backText}>{step === 4 ? "Ajustar mi lista" : "Volver"}</Text>
        </Pressable>
      )}

      {step === 0 && <BudgetStep key={`${budget}-${people}-${area}`} budget={budget} people={people} area={area} onArea={() => openModal("area")} onNext={setBudgetPeople} />}
      {step === 1 && <ListStep initial={items} onNext={setItems} />}
      {step === 2 && <ReviewStep items={items} onNext={compare} />}
      {step === 3 && (
        <View style={styles.loading}>
          <View style={styles.loadingIcon}>
            <ShoppingBag size={43} strokeWidth={1.3} color={colors.primary} />
          </View>
          <Text style={styles.loadingKicker}>Nosotros hacemos las vueltas</Text>
          <Text style={styles.loadingTitle}>Buscando dónde rinde más.</Text>
          <Text style={styles.loadingText}>Buscamos tu lista en los catálogos y volvemos a verificar en vivo cada precio que elegimos.</Text>
          <VerifyProgressRows progress={progress} />
          <Text style={styles.loadingFine}>Si una tienda no responde, te lo diremos. Nunca rellenamos precios.</Text>
        </View>
      )}
      {step === 4 && result && (
        <PlanStep result={result} area={area} progress={progress} refreshing={refreshing} onRefresh={refresh} deciding={deciding} onDecide={decide} onEdit={() => go(2)} />
      )}

      {step > 0 && step < 3 && (
        <View style={styles.limit}>
          <ShieldCheck size={14} color={colors.primary} />
          <Text style={styles.limitText}>Tu límite: <Text style={styles.limitStrong}>{cop(budget)}</Text></Text>
          <Text style={styles.limitText}>{people} personas · {area}</Text>
        </View>
      )}

      <View style={styles.planHint}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={styles.planHintText}>Un plan, varias tiendas, mejores decisiones.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  savedButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  savedText: { fontSize: fontSize.caption, color: colors.mutedForeground },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  metaLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaLinkText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  metaArea: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
  metaAreaText: { fontSize: fontSize.small, color: colors.mutedForeground, flexShrink: 1 },
  progress: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  progressItem: { flexDirection: "row", alignItems: "center" },
  progressGrow: { flex: 1 },
  progressButton: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressLine: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotDone: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  dotTodo: { backgroundColor: colors.card },
  dotText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  dotTextActive: { color: "#FFFFFF" },
  stepName: { marginTop: -spacing.sm, fontSize: fontSize.caption, color: colors.mutedForeground },
  stepNameStrong: { fontWeight: "700", color: colors.primary },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start" },
  backText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  loading: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  loadingIcon: {
    width: 96, height: 96, borderRadius: 30, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  loadingKicker: { fontSize: fontSize.caption, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2, color: colors.accent },
  loadingTitle: { fontSize: 32, fontWeight: "800", letterSpacing: -1, color: colors.primary, textAlign: "center" },
  loadingText: { fontSize: fontSize.subhead, lineHeight: 26, color: colors.mutedForeground, textAlign: "center" },
  loadingFine: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground, textAlign: "center" },
  limit: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap",
    borderRadius: radius.md, backgroundColor: colors.secondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  limitText: { fontSize: fontSize.caption, color: colors.primary },
  limitStrong: { fontWeight: "700" },
  planHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  planHintText: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
