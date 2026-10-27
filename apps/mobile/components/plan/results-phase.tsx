import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { AlertCircle, ArrowDown, ArrowRight, Check, Info, ListChecks, RefreshCw, Scale, Share2, ShieldCheck, X } from "lucide-react-native";
import { FadeIn, Pop, useReducedMotion } from "@/components/motion";
import { StoreLogo } from "@/components/brand";
import { PlanLineRow } from "@/components/plan/plan-line";
import { VerifyProgressRows } from "@/components/plan/verify-progress";
import { cop } from "@/lib/market";
import { STORE_NAME, type Alternative, type Plan, type PlanLine, type PlanResult, type Tradeoff, type VerifyProgress } from "@/lib/planner";
import { shareReceipt } from "@/lib/share-receipt";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

type Strategy = { label: string; alt: Alternative; plan: Plan };

const lineCount = (p: Plan) => p.stores.reduce((n, s) => n + s.lines.length, 0);

/**
 * The ways to buy this list that the planner computed: the best single store, the lowest total, and its
 * recommendation (which weighs the cost of an extra stop) when that is neither. Every total is the
 * optimizer's; nothing here is recomputed or estimated.
 */
function strategies(result: PlanResult): Strategy[] {
  const rec = result.plan;
  const planFor = (alt: Alternative) => (alt.stops === rec.stops ? rec : result.variants.find(v => v.stops === alt.stops));
  const alts = rec.alternatives.filter(a => planFor(a));
  if (alts.length < 2) return [];
  const one = alts.find(a => a.stops === 1);
  const max = [...alts].sort((a, b) => a.total - b.total || a.stops - b.stops)[0]!;
  const recommended = alts.find(a => a.recommended);
  const out: Strategy[] = [];
  if (recommended && recommended.stops !== max.stops && recommended.stops !== one?.stops) out.push({ label: "Recomendado", alt: recommended, plan: planFor(recommended)! });
  out.push({ label: "Ahorrar al máximo", alt: max, plan: planFor(max)! });
  if (one && one.stops !== max.stops) out.push({ label: "Todo en una tienda", alt: one, plan: planFor(one)! });
  return out;
}

/** The wait between phases 2 and 3: what we're doing, live per-store progress, and a skeleton of what's coming. */
export function CheckingPhase({ progress }: { progress: VerifyProgress[] }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <FadeIn>
        <Text accessibilityRole="header" style={styles.title}>Buscando dónde rinde más.</Text>
        <Text style={styles.lede}>Buscamos tu lista en cada tienda y volvemos a verificar en vivo cada precio que elegimos.</Text>
      </FadeIn>
      <VerifyProgressRows progress={progress} compact />
      <Skeleton />
      <Text style={styles.fine}>Si una tienda no responde, te lo decimos. Nunca rellenamos precios.</Text>
    </ScrollView>
  );
}

function Skeleton() {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) return;
    const step = (toValue: number) => Animated.timing(pulse, { toValue, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" });
    const loop = Animated.loop(Animated.sequence([step(1), step(0.5)]));
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.skeleton, { opacity: pulse }]}>
      <View style={[styles.bone, { width: "45%" }]} />
      <View style={[styles.bone, styles.boneBig]} />
      <View style={[styles.bone, { width: "70%" }]} />
      <View style={[styles.bone, { width: "60%" }]} />
    </Animated.View>
  );
}

/** Phase 3, "Descubre dónde rinde más". */
export function ResultsPhase({ result, hasBudget, area, progress, refreshing, deciding, onRefresh, onDecide, onEdit }: {
  result: PlanResult; hasBudget: boolean; area: string; progress: VerifyProgress[]; refreshing: boolean; deciding: string | null;
  onRefresh: () => void; onDecide: (key: string, decision: "accept" | "reject") => void; onEdit: () => void;
}) {
  const recommended = result.plan;
  const options = useMemo(() => strategies(result), [result]);
  const [stops, setStops] = useState(recommended.stops);
  const [now, setNow] = useState(Date.now());
  const [sharing, setSharing] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const routeY = useRef(0);
  const firstBasket = useRef(result.basketId);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  // A new plan (re-check or accepted change) resets the strategy to the recommendation and says so.
  useEffect(() => {
    setStops(recommended.stops);
    if (firstBasket.current !== result.basketId) {
      firstBasket.current = result.basketId;
      toast.success("Plan actualizado con los precios de ahora.", { duration: 1800 });
    }
  }, [result.basketId, recommended.stops]);

  const chosen = options.find(o => o.alt.stops === stops);
  const plan = chosen?.plan ?? recommended;
  const viewingRecommended = plan === recommended;
  const priced = lineCount(plan);
  const asked = priced + plan.unavailable.length;
  const bestCoverage = Math.max(priced, ...options.map(o => lineCount(o.plan)));
  const over = hasBudget && plan.overBudget > 0;
  const stale = now - new Date(result.checkedAt).getTime() > 5 * 60000;
  const lines = plan.stores.flatMap(s => s.lines).sort((a, b) => b.lineTotal - a.lineTotal);
  const swaps = lines.filter(l => l.isSubstitute).length;
  const brandOffers = result.tradeoffs.filter(t => t.kind === "allow-brand");

  async function share() {
    setSharing(true);
    try {
      const status = await shareReceipt(plan, area, result.checkedAt);
      if (status === "shared") toast.success("Tu plan está listo para compartir.");
    } catch {
      toast.error("No pudimos compartirlo. Inténtalo de nuevo.");
    } finally {
      setSharing(false);
    }
  }

  if (priced === 0) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text accessibilityRole="header" style={styles.title}>Sin precios que mostrarte.</Text>
        <Text style={styles.lede}>Hoy no encontramos precios verificables para tu lista. No inventamos totales: ajusta los productos o inténtalo más tarde.</Text>
        <Unavailable plan={plan} onEdit={onEdit} />
      </ScrollView>
    );
  }

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={styles.title}>Este es tu mercado inteligente.</Text>
          <Text style={[styles.lede, stale && styles.staleText]}>
            {stale ? "Estos precios tienen más de 5 minutos. Vuelve a verificar antes de salir." : `Precios verificados a las ${new Date(result.checkedAt).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a verificar los precios" disabled={refreshing || !!deciding} onPress={onRefresh} style={[styles.refresh, (refreshing || !!deciding) && styles.disabled]}>
          <RefreshCw size={16} color={colors.primary} />
        </Pressable>
      </View>
      {refreshing && <VerifyProgressRows progress={progress} stores={recommended.stores.map(s => s.retailer)} compact />}

      {options.length > 0 && (
        <View style={styles.strategyBlock}>
          <View accessibilityRole="radiogroup" style={styles.strategies}>
            {options.map(o => {
              const on = o.alt.stops === stops;
              return (
                <Pressable key={o.alt.stops} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setStops(o.alt.stops)} style={[styles.strategy, on && styles.strategyOn]}>
                  <Text style={[styles.strategyLabel, on && styles.strategyLabelOn]} numberOfLines={1}>{o.label}</Text>
                  <Text style={[styles.strategyTotal, on && styles.strategyLabelOn]}>{cop(o.alt.total)}</Text>
                  <Text style={[styles.strategyMeta, on && styles.strategyMetaOn]} numberOfLines={1}>
                    {o.alt.retailers.map(r => STORE_NAME[r]).join(" + ")}{o.alt.recommended && o.label !== "Recomendado" ? " · recomendado" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {plan.stops > 1 && (
            <Text style={styles.note}>
              {plan.stops} paradas. Al recomendar sumamos {cop(recommended.tripCost)} por cada tienda extra: el transporte y tu tiempo pueden comerse un ahorro pequeño.
            </Text>
          )}
          {!options.some(o => o.alt.stops === 1) && recommended.baseline && (
            <Text style={styles.note}>
              Ninguna tienda tiene todo. En una sola, la que más cubre es {STORE_NAME[recommended.baseline.retailer]}: {recommended.baseline.itemIds.length} de {asked} productos por {cop(recommended.baseline.total)}, sin cambios de marca.
            </Text>
          )}
          {priced < bestCoverage && (
            <View style={styles.warnRow}>
              <AlertCircle size={13} color={colors.warnInk} />
              <Text style={styles.warnText}>Esta opción tiene precio para {priced} de {asked} productos; su total no se compara directo con las otras.</Text>
            </View>
          )}
        </View>
      )}

      <FadeIn>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Así rinde tu mercado</Text>
          <Pop value={plan.total}>
            <Text style={styles.heroTotal} selectable>{cop(plan.total)}</Text>
          </Pop>
          <Text style={styles.heroSub}>
            {plan.unavailable.length ? `Total de los ${priced} productos con precio` : "Total de tu mercado"} · {plan.stores.map(s => STORE_NAME[s.retailer]).join(" + ")}
          </Text>
          <View style={styles.heroStores}>
            {plan.stores.map(s => <StoreLogo key={s.retailer} store={STORE_NAME[s.retailer]} small />)}
            <Text style={styles.heroCoverage}>Precio para {priced} de {asked} productos</Text>
          </View>

          {hasBudget && (
            <View style={styles.heroBudget}>
              <View style={styles.heroRow}>
                <Text style={styles.heroLabel}>Tu presupuesto</Text>
                <Text style={styles.heroValue}>{cop(plan.budget)}</Text>
              </View>
              <Meter share={Math.min(1, plan.total / plan.budget)} over={over} />
              <View style={styles.heroRow}>
                <Text style={styles.heroLabel}>{over ? "Te pasas por" : "Te quedarían"}</Text>
                <Text style={[styles.heroValue, over ? styles.heroOver : styles.heroLeft]}>{cop(Math.abs(plan.remaining))}</Text>
              </View>
            </View>
          )}

          {plan.baseline && plan.savings !== null && plan.savings > 0 ? (
            <View style={styles.heroSavings}>
              <View style={styles.savingsPill}>
                <ArrowDown size={14} color="#FFFFFF" />
                <Text style={styles.savingsPillText}>Ahorras {cop(plan.savings)}</Text>
              </View>
              <Text style={styles.heroNote}>{plan.baseline.description}: {cop(plan.baseline.total)}.</Text>
            </View>
          ) : plan.baseline ? (
            <Text style={styles.heroNote}>{plan.baseline.description} cuesta lo mismo: ya es la opción más barata.</Text>
          ) : null}

          <View style={styles.heroActions}>
            <Pressable accessibilityRole="button" onPress={() => scroll.current?.scrollTo({ y: routeY.current - spacing.lg, animated: true })} style={[styles.heroButton, styles.heroButtonMain]}>
              <ListChecks size={16} color={colors.forest} />
              <Text style={styles.heroButtonMainText}>Ver productos</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={sharing} onPress={() => void share()} style={[styles.heroButton, sharing && styles.disabled]}>
              <Share2 size={16} color={colors.forestInk} />
              <Text style={styles.heroButtonText}>{sharing ? "Preparando…" : "Compartir"}</Text>
            </Pressable>
          </View>
          <Text style={styles.heroFine}>Guardado en este dispositivo · No incluye domicilios ni transporte.</Text>
        </View>
      </FadeIn>

      {viewingRecommended && over && (
        <TradeoffPanel overBudget={plan.overBudget} tradeoffs={result.tradeoffs} deciding={deciding} progress={progress} onDecide={onDecide} onEdit={onEdit} />
      )}

      {plan.unavailable.length > 0 && (
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.gap}>
          <AlertCircle size={16} color={colors.warnInk} />
          <Text style={styles.gapText}>
            Sin precio: {plan.unavailable.map(u => u.label).join(", ")}. No suman a ningún total.
          </Text>
          <ArrowRight size={14} color={colors.warnInk} />
        </Pressable>
      )}

      <Breakdown lines={lines} total={plan.total} now={now} />
      {(swaps > 0 || brandOffers.length > 0) && (
        <View style={styles.tip}>
          <Info size={14} color={colors.primary} />
          <Text style={styles.tipText}>
            {swaps > 0 ? `${swaps} ${swaps === 1 ? "producto lleva" : "productos llevan"} una marca equivalente que rinde más. ` : ""}
            {brandOffers.length > 0 ? `Si aceptas otra marca en ${brandOffers.length === 1 ? "un producto" : `${brandOffers.length} productos`}, el total baja; míralo arriba.` : ""}
          </Text>
        </View>
      )}

      <View onLayout={e => { routeY.current = e.nativeEvent.layout.y; }} style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Tu ruta de compra</Text>
        {plan.stores.map((store, i) => (
          <View key={store.retailer} style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <View style={styles.storeIndex}><Text style={styles.storeIndexText}>{i + 1}</Text></View>
              <StoreLogo store={STORE_NAME[store.retailer]} />
              <Text style={styles.storeCount}>{store.lines.length} {store.lines.length === 1 ? "producto" : "productos"}</Text>
              <Text style={styles.storeTotal} selectable>{cop(store.subtotal)}</Text>
            </View>
            {store.lines.map((line, index) => (
              <View key={line.itemId} style={index < store.lines.length - 1 && styles.divider}>
                <PlanLineRow line={line} now={now} />
              </View>
            ))}
          </View>
        ))}
      </View>

      <Unavailable plan={plan} onEdit={onEdit} />

      <View style={styles.trust}>
        <ShieldCheck size={14} color={colors.mutedForeground} />
        <Text style={styles.fine}>Cada precio dice si se verificó en vivo, es de catálogo o lo reportó un comprador. Los precios cambian y dependen de la cobertura de cada tienda. No reservamos productos ni compramos por ti.</Text>
      </View>
    </ScrollView>
  );
}

function Meter({ share, over }: { share: number; over: boolean }) {
  const reduced = useReducedMotion();
  const width = useRef(new Animated.Value(reduced ? share : 0)).current;
  useEffect(() => {
    if (reduced) { width.setValue(share); return; }
    const anim = Animated.timing(width, { toValue: share, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [share, reduced, width]);
  return (
    <View style={styles.meter}>
      <Animated.View style={[styles.meterFill, over && styles.meterOver, { width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
}

/** "Dónde se va tu plata": the lines that weigh most on the total, each opening to its full detail. */
function Breakdown({ lines, total, now }: { lines: PlanLine[]; total: number; now: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const top = lines.slice(0, 5);
  if (lines.length < 3) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Dónde se va tu plata</Text>
      <View style={styles.breakdown}>
        {top.map(line => {
          const share = line.lineTotal / total;
          const on = open === line.itemId;
          return (
            <View key={line.itemId}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : line.itemId)} style={styles.barRow}>
                <View style={styles.barHead}>
                  <Text numberOfLines={1} style={styles.barName}>{line.label}</Text>
                  <Text style={styles.barShare}>{Math.round(share * 100)} %</Text>
                  <Text style={styles.barTotal}>{cop(line.lineTotal)}</Text>
                </View>
                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(2, share * 100)}%` }]} /></View>
              </Pressable>
              {on && <View style={styles.barDetail}><PlanLineRow line={line} now={now} /></View>}
            </View>
          );
        })}
        {lines.length > top.length && <Text style={styles.note}>Y {lines.length - top.length} productos más en tu ruta.</Text>}
      </View>
    </View>
  );
}

function Unavailable({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  if (!plan.unavailable.length) return null;
  return (
    <View style={styles.unavailable}>
      <View style={styles.unavailableHead}>
        <AlertCircle size={18} color={colors.warnInk} />
        <Text style={styles.unavailableTitle}>Sin precio para {plan.unavailable.length} {plan.unavailable.length === 1 ? "producto" : "productos"}</Text>
      </View>
      <Text style={styles.unavailableText}>No están en ningún total. No usamos estimaciones para llenar los vacíos.</Text>
      {plan.unavailable.map(u => (
        <Text key={u.itemId} style={styles.unavailableItem}>· <Text style={styles.unavailableName}>{u.label}</Text> — {u.reason}</Text>
      ))}
      <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editLink}>
        <Text style={styles.editLinkText}>Ajustar mi lista</Text>
        <ArrowRight size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function TradeoffPanel({ overBudget, tradeoffs, deciding, progress, onDecide, onEdit }: {
  overBudget: number; tradeoffs: Tradeoff[]; deciding: string | null; progress: VerifyProgress[];
  onDecide: (key: string, decision: "accept" | "reject") => void; onEdit: () => void;
}) {
  return (
    <View style={styles.tradeoffs}>
      <View style={styles.unavailableHead}>
        <Scale size={18} color={colors.warnInk} />
        <Text style={styles.unavailableTitle}>Te pasas por {cop(overBudget)}. ¿Qué ajustamos?</Text>
      </View>
      <Text style={styles.unavailableText}>
        {tradeoffs.length ? "Cada ahorro sale de recalcular tu plan con el cambio. Nada cambia sin tu sí." : "No encontramos cambios que bajen el total. Ajusta la lista o el presupuesto; no ocultamos el exceso."}
      </Text>
      {tradeoffs.map(t => {
        const busy = deciding === t.key;
        return (
          <View key={t.key} style={styles.tradeoff}>
            <Text style={styles.tradeoffTitle}>{t.title}</Text>
            {busy ? (
              <VerifyProgressRows progress={progress} compact />
            ) : (
              <View style={styles.tradeoffActions}>
                <Pressable accessibilityRole="button" disabled={!!deciding} onPress={() => onDecide(t.key, "accept")} style={[styles.accept, !!deciding && styles.disabled]}>
                  <Check size={14} color="#FFFFFF" />
                  <Text style={styles.acceptText}>Aceptar</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={!!deciding} onPress={() => onDecide(t.key, "reject")} style={[styles.reject, !!deciding && styles.disabled]}>
                  <X size={14} color={colors.primary} />
                  <Text style={styles.rejectText}>No, gracias</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      {!tradeoffs.length && (
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editLink}>
          <Text style={styles.editLinkText}>Ajustar mi lista</Text>
          <ArrowRight size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8, color: colors.foreground },
  lede: { marginTop: 4, fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  staleText: { color: colors.warnInkSoft },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headText: { flex: 1 },
  refresh: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  strategyBlock: { gap: spacing.sm },
  strategies: { flexDirection: "row", gap: spacing.sm },
  strategy: { flex: 1, gap: 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md },
  strategyOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  strategyLabel: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  strategyLabelOn: { color: "#FFFFFF" },
  strategyTotal: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  strategyMeta: { fontSize: fontSize.small, color: colors.mutedForeground },
  strategyMetaOn: { color: "rgba(255,255,255,0.85)" },
  note: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  warnRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  warnText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.warnInk },
  hero: { gap: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.forest, padding: spacing.xl },
  heroKicker: { fontSize: fontSize.body, fontWeight: "700", color: colors.forestSub },
  heroTotal: { fontSize: 44, fontWeight: "900", letterSpacing: -1.6, color: colors.forestInk, fontVariant: ["tabular-nums"] },
  heroSub: { marginTop: -4, fontSize: fontSize.caption, color: colors.forestSub },
  heroStores: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  heroCoverage: { fontSize: fontSize.caption, fontWeight: "600", color: colors.forestInk },
  heroBudget: { gap: 6, borderTopWidth: 1, borderTopColor: colors.forestLine, paddingTop: spacing.md, marginTop: spacing.xs },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  heroLabel: { fontSize: fontSize.caption, color: colors.forestSub },
  heroValue: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.forestInk, fontVariant: ["tabular-nums"] },
  heroLeft: { fontSize: fontSize.title, color: colors.forestGood },
  heroOver: { fontSize: fontSize.title, color: colors.forestWarn },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.forestLine, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.forestMeter },
  meterOver: { backgroundColor: colors.accent },
  heroSavings: { gap: 6, borderTopWidth: 1, borderTopColor: colors.forestLine, paddingTop: spacing.md, marginTop: spacing.xs },
  savingsPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: 6 },
  savingsPillText: { fontSize: fontSize.subhead, fontWeight: "800", color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  heroNote: { fontSize: fontSize.caption, lineHeight: 16, color: colors.forestSub },
  heroActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  heroButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.forestLine, paddingVertical: 11 },
  heroButtonMain: { backgroundColor: colors.forestInk, borderColor: colors.forestInk },
  heroButtonMainText: { fontSize: fontSize.body, fontWeight: "800", color: colors.forest },
  heroButtonText: { fontSize: fontSize.body, fontWeight: "700", color: colors.forestInk },
  heroFine: { fontSize: fontSize.small, color: colors.forestSub, textAlign: "center" },
  gap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warnSurface, padding: spacing.md },
  gapText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.warnInk },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  breakdown: { gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  barRow: { gap: 6 },
  barHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  barName: { flex: 1, fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  barShare: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  barTotal: { minWidth: 72, textAlign: "right", fontSize: fontSize.body, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  barDetail: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.background },
  tip: { flexDirection: "row", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.md },
  tipText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.secondaryForeground },
  storeCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  storeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background, padding: spacing.lg },
  storeIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  storeIndexText: { fontSize: fontSize.caption, fontWeight: "800", color: "#FFFFFF" },
  storeCount: { fontSize: fontSize.caption, color: colors.mutedForeground },
  storeTotal: { marginLeft: "auto", fontSize: fontSize.subhead, fontWeight: "800", fontVariant: ["tabular-nums"], color: colors.foreground },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  unavailable: { gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.warnBg, padding: spacing.lg },
  unavailableHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unavailableTitle: { flex: 1, fontSize: fontSize.subhead, fontWeight: "800", color: colors.warnInk },
  unavailableText: { fontSize: fontSize.caption, lineHeight: 17, color: colors.warnInk },
  unavailableItem: { fontSize: fontSize.caption, lineHeight: 17, color: colors.mutedForeground },
  unavailableName: { fontWeight: "700", color: colors.foreground },
  editLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
  editLinkText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  tradeoffs: { gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.warnBg, padding: spacing.lg },
  tradeoff: { gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  tradeoffTitle: { fontSize: fontSize.subhead, lineHeight: 20, fontWeight: "600", color: colors.foreground },
  tradeoffActions: { flexDirection: "row", gap: spacing.sm },
  accept: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  acceptText: { fontSize: fontSize.caption, fontWeight: "700", color: "#FFFFFF" },
  reject: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rejectText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  trust: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  fine: { flex: 1, fontSize: fontSize.caption, lineHeight: 17, color: colors.mutedForeground },
  skeleton: { gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.muted, padding: spacing.xl },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.border },
  boneBig: { height: 36, width: "65%", borderRadius: 10 },
});
