import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AlertCircle, ArrowDown, ArrowRight, CheckCircle2, Info,
  RefreshCw, Share2, ShieldCheck, ShoppingBag, Store as StoreIcon,
} from "lucide-react-native";
import { Accordion, Button } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { OfferLine } from "@/components/offer-line";
import { Basket, cop, LookupResult, optimize, quantityLabel, STORES } from "@/lib/market";
import { shareReceipt } from "@/lib/share-receipt";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

export function PlanStep({ result, budget, onRefresh, refreshing, onEdit }: {
  result: LookupResult; budget: number; onRefresh: () => void; refreshing: boolean; onEdit: () => void;
}) {
  const plan = optimize(result);
  const [mode, setMode] = useState<"split" | "single">("split");
  const [now, setNow] = useState(Date.now());
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const basket: Basket = mode === "single" && plan.single ? plan.single : plan.split;
  const count = result.rows.length;
  const over = basket.total > budget;
  const noPrices = !basket.assignments.length;
  const stale = now - new Date(result.checkedAt).getTime() > 5 * 60000;

  async function share() {
    setSharing(true);
    try {
      const status = await shareReceipt(basket, budget, result, plan.single);
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
            {noPrices ? "Hoy no logramos verificar precios compatibles. Tu lista está guardada para volver a intentarlo." : "Qué comprar, dónde encontrarlo y cuánto vas a gastar. Así de claro."}
          </Text>
        </View>
        <Button title={refreshing ? "Actualizando…" : "Volver a verificar"} variant="outline" disabled={refreshing} loading={refreshing} onPress={onRefresh} icon={!refreshing ? <RefreshCw size={14} color={colors.primary} /> : undefined} />
      </View>

      <View style={styles.notice}>
        <ShieldCheck size={16} color={colors.primary} />
        <Text style={styles.noticeText}>Precios observados en el canal online. Cobertura de entrega en {result.area}: por confirmar con cada tienda.</Text>
      </View>

      {!noPrices && (
        <>
          <View style={styles.modes}>
            <Pressable onPress={() => setMode("split")} style={[styles.mode, mode === "split" && styles.modeActive]}>
              <View style={styles.modeTitle}>
                <ShoppingBag size={17} color={colors.primary} />
                <Text style={styles.modeName}>Compra dividida</Text>
                {mode === "split" && <CheckCircle2 size={17} color={colors.primary} />}
              </View>
              <Text style={styles.modeTotal} selectable>{cop(plan.split.total)}</Text>
              <Text style={styles.modeMeta}>
                {plan.split.stops} {plan.split.stops === 1 ? "parada" : "paradas"} · {plan.split.assignments.length}/{count} productos{!plan.split.complete && " · Plan parcial"}
              </Text>
            </Pressable>
            <Pressable disabled={!plan.single} onPress={() => setMode("single")} style={[styles.mode, mode === "single" && styles.modeActive, !plan.single && styles.modeDisabled]}>
              <View style={styles.modeTitle}>
                <StoreIcon size={17} color={colors.primary} />
                <Text style={styles.modeName}>Una sola tienda</Text>
                {mode === "single" && <CheckCircle2 size={17} color={colors.primary} />}
              </View>
              <Text style={styles.modeTotal} selectable>{plan.single ? cop(plan.single.total) : "Sin canasta completa"}</Text>
              <Text style={styles.modeMeta}>
                {plan.single ? `${plan.single.store} · 1 parada · Lista completa` : "Ninguna tienda cubre toda la lista con precios verificados."}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Tu ruta de mercado</Text>
          {STORES.filter(store => basket.assignments.some(a => a.offer.store === store)).map((store, i) => (
            <View key={store} style={styles.storeCard}>
              <View style={styles.storeHeader}>
                <View style={styles.storeIndex}>
                  <Text style={styles.storeIndexText}>{i + 1}</Text>
                </View>
                <StoreLogo store={store} />
                <Text style={styles.storeTotal} selectable>
                  {cop(basket.assignments.filter(a => a.offer.store === store).reduce((s, a) => s + a.total, 0))}
                </Text>
              </View>
              <View>
                {basket.assignments.filter(a => a.offer.store === store).map(a => (
                  <View key={a.item.id} style={styles.offerDivider}>
                    <OfferLine assignment={a} offers={result.rows.find(row => row.item.id === a.item.id)?.offers || []} now={now} onEdit={onEdit} />
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
                <Text selectable>{cop(budget)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.strong}>{basket.complete ? "Total de tu mercado" : "Subtotal verificado"}</Text>
                <Text style={styles.strong} selectable>{cop(basket.total)}</Text>
              </View>
            </View>
            <View style={[styles.balance, over ? styles.balanceOver : styles.balanceOk]}>
              <Text style={styles.balanceLabel}>{over ? "Excede el presupuesto" : basket.complete ? "Te quedan" : "Saldo provisional"}</Text>
              <Text style={styles.balanceValue} selectable>{cop(Math.abs(budget - basket.total))}</Text>
            </View>
            {over && <Text style={styles.over}>No encontramos una canasta que cumpla este presupuesto. Ajusta la lista o el monto; no ocultamos el exceso.</Text>}
            {!basket.complete && <Text style={styles.partial}>Faltan productos por cotizar. Este subtotal no representa el costo de toda tu lista.</Text>}
            <View style={styles.savings}>
              {plan.savings !== null && plan.single && basket.complete ? (
                <>
                  <View style={styles.savingsTitle}>
                    <ArrowDown size={15} color={colors.primary} />
                    <Text style={styles.savingsName}>Ahorro: {cop(Math.max(0, plan.single.total - basket.total))}</Text>
                  </View>
                  <Text style={styles.muted}>
                    Comparación: tu lista con las marcas y empaques más económicos en {plan.single.store}, con un total de {cop(plan.single.total)}. {cop(plan.single.total)} − {cop(basket.total)} = {cop(plan.single.total - basket.total)}.
                  </Text>
                </>
              ) : (
                <Text style={styles.muted}>No calculamos ahorro sin una canasta completa de comparación. Nada de porcentajes inventados.</Text>
              )}
            </View>
            <Button title={sharing ? "Preparando comprobante…" : "Compartir mi comprobante"} disabled={sharing} loading={sharing} onPress={() => void share()} icon={!sharing ? <Share2 size={16} color="#FFFFFF" /> : undefined} />
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
            <View key={row.item.id} style={styles.unavailableItem}>
              <Accordion title={`${row.item.name} · ${quantityLabel(row.item.quantity, row.item.unit)}`}>
                {row.reasons.length ? (
                  row.reasons.map(r => <Text key={r} style={styles.reason}>· {r}</Text>)
                ) : (
                  <Text style={styles.reason}>No hay una marca o presentación compatible con tus preferencias. Edita la lista para revisar las restricciones.</Text>
                )}
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
            ? "Esta consulta tiene más de 5 minutos. Estamos intentando actualizarla; verifica los precios antes de salir."
            : `Última consulta: ${new Date(result.checkedAt).toLocaleString("es-CO")}. Los precios pueden cambiar y dependen del canal y la cobertura.`}
        </Text>
      </View>
    </ScrollView>
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
  modeTotal: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  modeMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
  sectionTitle: { fontSize: fontSize.headline, fontWeight: "800" },
  storeCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  storeHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background, padding: spacing.lg,
  },
  storeIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  storeIndexText: { fontSize: fontSize.caption, fontWeight: "800", color: "#FFFFFF" },
  storeTotal: { marginLeft: "auto", fontSize: fontSize.subhead, fontWeight: "800", fontVariant: ["tabular-nums"] },
  offerDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  summary: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.md },
  summaryTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  summaryName: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary },
  summaryRows: { gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: "dashed", paddingBottom: spacing.lg },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  muted: { fontSize: fontSize.caption, lineHeight: 20, color: colors.mutedForeground },
  strong: { fontSize: fontSize.subhead, fontWeight: "600" },
  balance: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, padding: spacing.lg },
  balanceOk: { backgroundColor: colors.secondary },
  balanceOver: { backgroundColor: "#FFF4E8" },
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
});
