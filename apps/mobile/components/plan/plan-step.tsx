import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AlertCircle, ArrowDown, ArrowRight, Check, CheckCircle2, Info,
  RefreshCw, Scale, Share2, ShieldCheck, X,
} from "lucide-react-native";
import { Accordion, Button } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { PlanLineRow } from "@/components/plan/plan-line";
import { VerifyProgressRows } from "@/components/plan/verify-progress";
import { cop } from "@/lib/market";
import { STORE_NAME, type Plan, type PlanResult, type Tradeoff, type VerifyProgress } from "@/lib/planner";
import { shareReceipt } from "@/lib/share-receipt";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

export function PlanStep({ result, area, progress, onRefresh, refreshing, deciding, onDecide, onEdit }: {
  result: PlanResult; area: string; progress: VerifyProgress[]; onRefresh: () => void; refreshing: boolean;
  deciding: string | null; onDecide: (key: string, decision: "accept" | "reject") => void; onEdit: () => void;
}) {
  const recommended = result.plan;
  const [stops, setStops] = useState(recommended.stops);
  const [now, setNow] = useState(Date.now());
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  // A new plan (re-check or accepted trade-off) resets the switcher to its recommendation.
  useEffect(() => setStops(recommended.stops), [result.basketId, recommended.stops]);

  const plan: Plan = stops === recommended.stops ? recommended : result.variants.find(v => v.stops === stops) ?? recommended;
  const viewingRecommended = plan === recommended;
  const lines = plan.stores.reduce((n, s) => n + s.lines.length, 0);
  const noPrices = lines === 0;
  const over = plan.overBudget > 0;
  const stale = now - new Date(result.checkedAt).getTime() > 5 * 60000;

  async function share() {
    setSharing(true);
    try {
      const status = await shareReceipt(plan, area, result.checkedAt);
      if (status === "shared") toast.success("Tu comprobante está listo.");
    } catch {
      toast.error("No pudimos compartirlo. Inténtalo de nuevo.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>De la lista a tu mesa</Text>
          <Text style={styles.hero}>{noPrices ? "Sin inventos. Sin precios falsos." : "Tu plata ya tiene un plan."}</Text>
          <Text style={styles.lede}>
            {noPrices
              ? "Hoy no logramos verificar precios compatibles. Tu lista está guardada para volver a intentarlo."
              : `Qué comprar en ${plan.stops === 1 ? "una tienda" : `${plan.stops} tiendas`}, en qué orden y cuánto vas a gastar.`}
          </Text>
        </View>
        <Button title={refreshing ? "Verificando…" : "Volver a verificar"} variant="outline" disabled={refreshing || !!deciding} loading={refreshing} onPress={onRefresh} icon={!refreshing ? <RefreshCw size={14} color={colors.primary} /> : undefined} />
      </View>

      {refreshing && <VerifyProgressRows progress={progress} stores={recommended.stores.map(s => s.retailer)} compact />}

      <View style={styles.notice}>
        <ShieldCheck size={16} color={colors.primary} />
        <Text style={styles.noticeText}>Precios observados en el canal online y verificados antes de mostrarte el plan. Cobertura de entrega en {area}: por confirmar con cada tienda.</Text>
      </View>

      {!noPrices && recommended.alternatives.length > 1 && (
        <View style={styles.modes}>
          <Text style={styles.sectionTitle}>¿Cuántas paradas quieres hacer?</Text>
          {recommended.alternatives.map(alt => {
            const active = alt.stops === stops;
            const names = alt.retailers.map(r => STORE_NAME[r]).join(" + ");
            return (
              <Pressable
                key={alt.stops}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setStops(alt.stops)}
                style={[styles.mode, active && styles.modeActive]}
              >
                <View style={styles.modeTitle}>
                  <Text style={styles.modeName}>{alt.stops} {alt.stops === 1 ? "parada" : "paradas"} · {names}</Text>
                  {active && <CheckCircle2 size={17} color={colors.primary} />}
                </View>
                <Text style={styles.modeTotal} selectable>{cop(alt.total)}</Text>
                <Text style={[styles.modeMeta, alt.recommended && styles.modeRecommended]}>
                  {alt.recommended
                    ? "Recomendado"
                    : alt.difference < 0
                      ? `${cop(-alt.difference)} menos, pero ${alt.stops > recommended.stops ? "una vuelta más: no compensa el viaje" : "con menos vueltas"}`
                      : `${cop(alt.difference)} más que la opción recomendada`}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.muted}>Una parada extra solo se recomienda si ahorra más de {cop(recommended.tripCost)}, lo que estimamos que cuesta el viaje.</Text>
        </View>
      )}

      {viewingRecommended && over && (
        <TradeoffPanel overBudget={plan.overBudget} tradeoffs={result.tradeoffs} deciding={deciding} progress={progress} onDecide={onDecide} onEdit={onEdit} />
      )}

      {!noPrices && (
        <>
          <Text style={styles.sectionTitle}>Tu ruta de mercado</Text>
          {plan.stores.map((store, i) => (
            <View key={store.retailer} style={styles.storeCard}>
              <View style={styles.storeHeader}>
                <View style={styles.storeIndex}>
                  <Text style={styles.storeIndexText}>{i + 1}</Text>
                </View>
                <StoreLogo store={STORE_NAME[store.retailer]} />
                <Text style={styles.storeCount}>{store.lines.length} {store.lines.length === 1 ? "producto" : "productos"}</Text>
                <Text style={styles.storeTotal} selectable>{cop(store.subtotal)}</Text>
              </View>
              <View>
                {store.lines.map((line, index) => (
                  <View key={line.itemId} style={index < store.lines.length - 1 && styles.offerDivider}>
                    <PlanLineRow line={line} now={now} />
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.summary}>
            <View style={styles.summaryTitle}>
              <CheckCircle2 size={18} color={colors.primary} />
              <Text style={styles.summaryName}>Tus cuentas, claras</Text>
            </View>
            <View style={styles.summaryRows}>
              <View style={styles.summaryRow}>
                <Text style={styles.muted}>Tu presupuesto</Text>
                <Text selectable>{cop(plan.budget)}</Text>
              </View>
              {plan.stores.map(s => (
                <View key={s.retailer} style={styles.summaryRow}>
                  <Text style={styles.muted}>{STORE_NAME[s.retailer]}</Text>
                  <Text selectable>{cop(s.subtotal)}</Text>
                </View>
              ))}
              <View style={styles.summaryRow}>
                <Text style={styles.strong}>{plan.unavailable.length ? "Subtotal cotizado" : "Total de tu mercado"}</Text>
                <Text style={styles.strong} selectable>{cop(plan.total)}</Text>
              </View>
            </View>
            <View style={[styles.balance, over ? styles.balanceOver : styles.balanceOk]}>
              <Text style={styles.balanceLabel}>{over ? "Excede el presupuesto" : "Dentro del presupuesto · te quedan"}</Text>
              <Text style={styles.balanceValue} selectable>{cop(Math.abs(plan.remaining))}</Text>
            </View>
            {plan.unavailable.length > 0 && <Text style={styles.partial}>Faltan productos por cotizar. Este subtotal no representa el costo de toda tu lista.</Text>}
            <View style={styles.savings}>
              {plan.baseline && plan.savings !== null && plan.savings > 0 ? (
                <>
                  <View style={styles.savingsTitle}>
                    <ArrowDown size={15} color={colors.primary} />
                    <Text style={styles.savingsName}>Ahorras {cop(plan.savings)}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {plan.baseline.description}: {cop(plan.baseline.total)}
                    {plan.baseline.itemIds.length < lines ? ` (comparando los ${plan.baseline.itemIds.length} productos que ${STORE_NAME[plan.baseline.retailer]} tiene)` : ""}.
                  </Text>
                </>
              ) : plan.baseline ? (
                <Text style={styles.muted}>{plan.baseline.description}, cuesta lo mismo: {cop(plan.baseline.total)}. Ya estás en la opción más barata.</Text>
              ) : (
                <Text style={styles.muted}>No calculamos ahorro sin un carrito de comparación. Nada de porcentajes inventados.</Text>
              )}
            </View>
            <Button title={sharing ? "Preparando comprobante…" : "Compartir mi plan"} disabled={sharing} loading={sharing} onPress={() => void share()} icon={!sharing ? <Share2 size={16} color="#FFFFFF" /> : undefined} />
            <Text style={styles.fine}>No incluye domicilios ni transporte.{"\n"}No reservamos productos ni realizamos compras.</Text>
          </View>
        </>
      )}

      {plan.unavailable.length > 0 && (
        <View style={styles.unavailable}>
          <View style={styles.unavailableTitle}>
            <AlertCircle size={19} color={colors.warnInk} />
            <Text style={styles.unavailableName}>
              No pudimos cotizar {plan.unavailable.length} {plan.unavailable.length === 1 ? "producto" : "productos"}
            </Text>
          </View>
          <Text style={styles.unavailableText}>No están incluidos en ningún total. No usamos estimaciones para llenar los vacíos.</Text>
          {plan.unavailable.map(row => (
            <View key={row.itemId} style={styles.unavailableItem}>
              <Accordion title={row.label}>
                <Text style={styles.reason}>· {row.reason}</Text>
              </Accordion>
            </View>
          ))}
          <Button title="Corregir o ajustar mi lista" variant="outline" onPress={onEdit} icon={<ArrowRight size={14} color={colors.primary} />} />
        </View>
      )}

      <View style={styles.staleRow}>
        <Info size={15} color={stale ? colors.warnInkSoft : colors.mutedForeground} />
        <Text style={[styles.stale, stale && styles.staleWarn]}>
          {stale
            ? "Este plan tiene más de 5 minutos. Vuelve a verificar los precios antes de salir."
            : `Plan armado: ${new Date(result.checkedAt).toLocaleString("es-CO")}. Los precios pueden cambiar y dependen del canal y la cobertura.`}
        </Text>
      </View>
    </ScrollView>
  );
}

function TradeoffPanel({ overBudget, tradeoffs, deciding, progress, onDecide, onEdit }: {
  overBudget: number; tradeoffs: Tradeoff[]; deciding: string | null; progress: VerifyProgress[];
  onDecide: (key: string, decision: "accept" | "reject") => void; onEdit: () => void;
}) {
  return (
    <View style={styles.tradeoffs}>
      <View style={styles.unavailableTitle}>
        <Scale size={19} color={colors.warnInk} />
        <Text style={styles.unavailableName}>Te pasas por {cop(overBudget)}. ¿Qué ajustamos?</Text>
      </View>
      {tradeoffs.length ? (
        <Text style={styles.unavailableText}>Cada ahorro sale de recalcular tu plan con el cambio. Tú decides; nada cambia sin tu sí.</Text>
      ) : (
        <Text style={styles.unavailableText}>No encontramos cambios que bajen el total. Ajusta la lista o el presupuesto; no ocultamos el exceso.</Text>
      )}
      {tradeoffs.map(t => {
        const busy = deciding === t.key;
        return (
          <View key={t.key} style={styles.tradeoff}>
            <Text style={styles.tradeoffTitle}>{t.title}</Text>
            {busy ? (
              <VerifyProgressRows progress={progress} compact />
            ) : (
              <View style={styles.tradeoffActions}>
                <Pressable disabled={!!deciding} onPress={() => onDecide(t.key, "accept")} style={[styles.accept, !!deciding && styles.disabled]}>
                  <Check size={14} color="#FFFFFF" />
                  <Text style={styles.acceptText}>Aceptar</Text>
                </Pressable>
                <Pressable disabled={!!deciding} onPress={() => onDecide(t.key, "reject")} style={[styles.reject, !!deciding && styles.disabled]}>
                  <X size={14} color={colors.primary} />
                  <Text style={styles.rejectText}>No, gracias</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      {!tradeoffs.length && <Button title="Ajustar mi lista" variant="outline" onPress={onEdit} icon={<ArrowRight size={14} color={colors.primary} />} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { gap: spacing.md },
  headerText: { gap: spacing.sm },
  kicker: { fontSize: fontSize.caption, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2, color: colors.accent },
  hero: { fontSize: 32, fontWeight: "800", letterSpacing: -1, color: colors.primary },
  lede: { fontSize: fontSize.subhead, lineHeight: 26, color: colors.mutedForeground },
  notice: {
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.secondary, padding: spacing.lg,
  },
  noticeText: { flex: 1, fontSize: fontSize.caption, lineHeight: 18, color: colors.primary },
  modes: { gap: spacing.md },
  mode: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.sm },
  modeActive: { borderColor: colors.primary, borderWidth: 2 },
  modeDisabled: { backgroundColor: colors.muted, opacity: 0.8 },
  modeTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modeName: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  modeTotal: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, fontVariant: ["tabular-nums"], color: colors.foreground },
  modeMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: "800", color: colors.foreground },
  storeCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  storeHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background, padding: spacing.lg,
  },
  storeIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  storeIndexText: { fontSize: fontSize.caption, fontWeight: "800", color: "#FFFFFF" },
  storeTotal: { marginLeft: "auto", fontSize: fontSize.subhead, fontWeight: "800", fontVariant: ["tabular-nums"], color: colors.foreground },
  offerDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  summary: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.md },
  summaryTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  summaryName: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary },
  summaryRows: { gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: "dashed", paddingBottom: spacing.lg },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  muted: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  strong: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  balance: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, padding: spacing.lg },
  balanceOk: { backgroundColor: colors.secondary },
  balanceOver: { backgroundColor: colors.warnSurface },
  balanceLabel: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  balanceValue: { fontSize: fontSize.headline, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  over: { fontSize: fontSize.caption, lineHeight: 18, color: colors.destructive },
  partial: { fontSize: fontSize.caption, lineHeight: 18, color: colors.warnText },
  savings: { gap: 6 },
  savingsTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  savingsName: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  fine: { fontSize: fontSize.small, lineHeight: 16, textAlign: "center", color: colors.mutedForeground },
  unavailable: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.warnBg, padding: spacing.xl, gap: spacing.md,
  },
  unavailableTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unavailableName: { flex: 1, fontSize: fontSize.title, fontWeight: "700", color: colors.warnInk },
  unavailableText: { fontSize: fontSize.caption, lineHeight: 20, color: colors.warnInk },
  unavailableItem: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.lg },
  reason: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground, paddingBottom: 4 },
  staleRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stale: { flex: 1, fontSize: fontSize.caption, lineHeight: 22, color: colors.mutedForeground },
  staleWarn: { color: colors.warnInkSoft },
  storeCount: { fontSize: fontSize.caption, color: colors.mutedForeground },
  modeRecommended: { fontWeight: "700", color: colors.primary },
  tradeoffs: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.warnBg, padding: spacing.xl, gap: spacing.md,
  },
  tradeoff: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg, gap: spacing.md },
  tradeoffTitle: { fontSize: fontSize.subhead, lineHeight: 21, fontWeight: "600", color: colors.foreground },
  tradeoffActions: { flexDirection: "row", gap: spacing.sm },
  accept: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  acceptText: { fontSize: fontSize.caption, fontWeight: "700", color: "#FFFFFF" },
  reject: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rejectText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  disabled: { opacity: 0.5 },
});
