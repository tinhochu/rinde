import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Info, Navigation, Snowflake, Sparkles, Weight } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { Accordion, Button, Sheet } from "@/components/ui";
import { cop } from "@/lib/market";
import { googleMapsUrl, wazeUrl } from "@/lib/navigate";
import { CHAIN_NAMES, type LatLon, type RouteLine, type RouteOption, type RoutePlanEvent, type TravelMode } from "@/lib/route";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { RouteMap } from "./route-map";

type OptionsEvent = Extract<RoutePlanEvent, { type: "options" }>;
type AdviceEvent = Extract<RoutePlanEvent, { type: "advice" }>;
type QuestionEvent = Extract<RoutePlanEvent, { type: "question" }>;
type VerifiedEvent = Extract<RoutePlanEvent, { type: "verified" }>;

/**
 * The route plan: Muse's recommendation (or its question), the route on a map, each stop with its
 * items, the turn-by-turn steps, and "Navegar" into Google Maps or Waze. Every figure comes from the
 * server: stored prices, street routes, and the person's travel costs.
 */
export function RouteResult({ options, advice, question, verified, mode, start, onAnswer, onEdit }: {
  options: OptionsEvent;
  advice: AdviceEvent | null;
  question: QuestionEvent | null;
  verified: VerifiedEvent | null;
  mode: TravelMode;
  start: LatLon | null;
  onAnswer: (answer: string) => void;
  onEdit: () => void;
}) {
  const recommended = advice?.choice ?? question?.choice ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? recommended ?? 0;
  const option = options.options[shown]!;
  const isRecommended = shown === recommended;
  const fresh = verified && verified.choice === shown ? verified : null;
  const lines: RouteLine[][] = fresh?.stopLines ?? (isRecommended && advice ? advice.stopLines : option.stopLines);
  const goods = fresh?.goodsTotal ?? option.goodsTotal;
  const net = fresh?.net ?? option.net;
  const [navOpen, setNavOpen] = useState(false);
  const anchorName = options.options[0]!.stops[0]!.name;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {question ? (
        <View style={styles.advice} testID="route-question">
          <View style={styles.adviceHead}><Sparkles size={15} color={colors.primary} /><Text style={styles.adviceTag}>Muse pregunta</Text></View>
          <Text style={styles.adviceText}>{question.question}</Text>
          <View style={styles.answers}>
            <Button title="Sí" variant="outline" onPress={() => onAnswer("Sí")} />
            <Button title="No" variant="outline" onPress={() => onAnswer("No")} />
          </View>
          <Text style={styles.small}>Mientras tanto: {question.explanation}</Text>
        </View>
      ) : advice ? (
        <View style={styles.advice} testID="route-advice">
          <View style={styles.adviceHead}>
            <Sparkles size={15} color={colors.primary} />
            <Text style={styles.adviceTag}>{advice.source === "muse" ? "Recomendación de Muse" : "Nuestra recomendación"}</Text>
          </View>
          <Text style={styles.adviceText}>{advice.explanation}</Text>
          {advice.foregone && <Text style={styles.small}>Si pasas por {advice.foregone.label} ahorrarías {cop(advice.foregone.net)}.</Text>}
        </View>
      ) : (
        <View style={styles.advice}><Text style={styles.small}>Muse está mirando las opciones…</Text></View>
      )}

      {options.options.length > 1 && (
        <View style={styles.optionRow} accessibilityRole="radiogroup">
          {options.options.map((o, i) => (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: i === shown }}
              onPress={() => setPicked(i)}
              style={[styles.optionChip, i === shown && styles.optionChipOn]}
            >
              <Text style={[styles.optionLabel, i === shown && styles.optionLabelOn]}>{o.label}</Text>
              <Text style={styles.optionSub}>{i === 0 ? cop(o.goodsTotal) : `${gain(o)} · +${o.extraMinutes}`}</Text>
              {i === recommended && <Text style={styles.recommended}>Recomendada</Text>}
            </Pressable>
          ))}
        </View>
      )}

      <RouteMap route={option.route} stops={option.stops} start={options.startDropped ? null : start} />
      <View style={styles.summary}>
        {option.route && <Text style={styles.summaryText}>Recorrido {option.route.distance} · {option.route.minutes}{options.busEstimate ? " (estimado, sin horarios)" : ""}</Text>}
        {shown > 0 && <Text style={styles.summaryText}>La parada extra suma {option.extraDistance} y {option.extraMinutes}{option.travelCost ? `, ${cop(option.travelCost)} de trayecto` : ""}</Text>}
      </View>

      {option.stops.map((stop, i) => {
        const stopLines = lines[i] ?? [];
        const leg = option.route?.legs.find((l, n) => l.to === stop.name && n >= i - (start ? 0 : 1)) ?? option.route?.legs[i];
        return (
          <View key={`${stop.chain}-${i}`} style={styles.stop} testID="route-stop">
            <View style={styles.stopHead}>
              <View style={styles.stopNumber}><Text style={styles.stopNumberText}>{i + 1}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.stopName} testID="route-stop-name">{stop.name}</Text>
                <Text style={styles.stopSub} numberOfLines={2}>{[stop.area, stop.address].filter(Boolean).join(" · ") || "Dirección no registrada en el mapa"}</Text>
              </View>
              <StoreLogo store={CHAIN_NAMES[stop.chain]} small />
            </View>
            {leg && <Text style={styles.legText}>{leg.distance} · {leg.minutes} desde {i === 0 ? (start && !options.startDropped ? "tu ubicación" : "tu tienda") : "la parada anterior"}</Text>}
            {stopLines.length === 0 ? (
              <Text style={styles.small}>Nada de tu lista se compra aquí.</Text>
            ) : stopLines.map(l => (
              <View key={l.itemId} style={styles.line} testID="route-line">
                <View style={styles.flex}>
                  <Text style={styles.lineLabel} testID="route-line-label">{l.packs > 1 ? `${l.packs} × ` : ""}{l.label}</Text>
                  <Text style={styles.lineProduct} numberOfLines={1} testID="route-line-product">{l.product}</Text>
                </View>
                {l.cold && <Snowflake size={14} color={colors.primary} accessibilityLabel="Frío" />}
                {l.heavy && <Weight size={14} color={colors.mutedForeground} accessibilityLabel="Pesado" />}
                <Text style={styles.lineTotal} testID="route-line-total">{cop(l.lineTotal)}</Text>
              </View>
            ))}
            {stopLines.length > 0 && <Text style={styles.subtotal}>Subtotal {cop(stopLines.reduce((s, l) => s + l.lineTotal, 0))}</Text>}
          </View>
        );
      })}

      <View style={styles.totals}>
        <Text style={styles.total} testID="route-total">Total {cop(goods)}</Text>
        {shown > 0 && (
          <Text style={styles.net}>
            {net > 0 ? `Ahorras ${cop(net)} netos frente a comprar todo en ${anchorName}`
              : net < 0 ? `Te cuesta ${cop(-net)} más que comprar todo en ${anchorName}`
              : `Lo que ya compras en ${anchorName} cuesta lo mismo`}
          </Text>
        )}
        {option.extraItems.length > 0 && <Text style={styles.small}>Además consigues {option.extraItems.join(", ")}, que {anchorName} no tiene.</Text>}
        <Text style={styles.small}>{fresh ? `Precios verificados ahora (${fresh.checked}).` : "Precios de catálogo; los estamos verificando…"}</Text>
      </View>

      {option.route && option.route.legs.length > 0 && (
        <View style={styles.steps}>
          {option.route.legs.map((leg, i) => (
            <Accordion key={i} title={`Indicaciones hacia ${leg.to} · ${leg.distance}`}>
              {leg.steps.map((s, n) => <Text key={n} style={styles.step}>{n + 1}. {s}</Text>)}
            </Accordion>
          ))}
        </View>
      )}

      <View style={styles.notes}>
        <Info size={14} color={colors.mutedForeground} />
        <View style={styles.flex}>
          <Text style={styles.small}>Los precios en línea son de la cadena, no de la sucursal, y pueden variar en tienda.</Text>
          {options.startDropped && <Text style={styles.small}>No pudimos trazar la ruta desde tu ubicación; calculamos ida y vuelta desde tu tienda.</Text>}
          {options.leftOut.map(l => <Text key={l.chain} style={styles.small}>{l.reason}.</Text>)}
          <Text style={styles.small}>Rutas y tiendas: © OpenStreetMap contributors.</Text>
        </View>
      </View>

      <Button title="Navegar" onPress={() => setNavOpen(true)} icon={<Navigation size={16} color="#FFFFFF" />} />
      <Button title="Cambiar tienda o transporte" variant="outline" onPress={onEdit} />

      <NavigateSheet visible={navOpen} onClose={() => setNavOpen(false)} option={option} mode={mode} start={options.startDropped ? null : start} />
    </ScrollView>
  );
}

/** What the extra stop buys: money, else the items the usual store doesn't have. */
function gain(o: RouteOption) {
  if (o.net > 0) return `Ahorras ${cop(o.net)}`;
  if (o.net < 0) return `Pierdes ${cop(-o.net)}`;
  const n = o.extraItems.length;
  return n ? `+${n} ${n === 1 ? "producto" : "productos"}` : "Sin ahorro";
}

/** Google Maps takes every stop; Waze one at a time, with "Siguiente parada" after the first. */
function NavigateSheet({ visible, onClose, option, mode, start }: {
  visible: boolean; onClose: () => void; option: RouteOption; mode: TravelMode; start: LatLon | null;
}) {
  const [next, setNext] = useState(0);
  const stops = option.stops.map(s => ({ lat: s.lat, lon: s.lon }));
  const origin = start ? { lat: start[0], lon: start[1] } : null;
  const target = option.stops[next] ?? option.stops[0]!;
  return (
    <Sheet visible={visible} onClose={() => { setNext(0); onClose(); }}>
      <View style={styles.navBody}>
        <Text accessibilityRole="header" style={styles.navTitle}>Navegar</Text>
        <Text style={styles.small}>Rinde arma la ruta; la guía en vivo la hace tu app de mapas.</Text>
        <Button title="Abrir en Google Maps (todas las paradas)" onPress={() => void Linking.openURL(googleMapsUrl(stops, mode, origin))} />
        <Button title={`Abrir en Waze: ${target.name}`} variant="outline" onPress={() => void Linking.openURL(wazeUrl(stops[next] ?? stops[0]!))} />
        {option.stops.length > 1 && next < option.stops.length - 1 && (
          <Pressable accessibilityRole="button" onPress={() => setNext(n => n + 1)} hitSlop={6}>
            <Text style={styles.link}>Siguiente parada: {option.stops[next + 1]!.name}</Text>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  advice: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.secondaryBorder },
  adviceHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  adviceTag: { fontSize: fontSize.caption, fontWeight: "800", color: colors.secondaryForeground },
  adviceText: { fontSize: fontSize.subhead + 1, lineHeight: 22, fontWeight: "600", color: colors.foreground },
  answers: { flexDirection: "row", gap: spacing.sm },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  optionChip: { flexGrow: 1, flexBasis: 140, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  optionChipOn: { borderColor: colors.primary },
  optionLabel: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  optionLabelOn: { color: colors.primary },
  optionSub: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  recommended: { fontSize: fontSize.tiny, fontWeight: "800", color: colors.primary },
  summary: { gap: 2, marginTop: -spacing.sm },
  summaryText: { fontSize: fontSize.caption, color: colors.mutedForeground },
  stop: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  stopHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stopNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stopNumberText: { color: "#FFFFFF", fontWeight: "800", fontSize: fontSize.body },
  stopName: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  stopSub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  legText: { fontSize: fontSize.caption, fontWeight: "700", color: colors.secondaryForeground },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  lineLabel: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
  lineProduct: { fontSize: fontSize.caption, color: colors.mutedForeground },
  lineTotal: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
  subtotal: { alignSelf: "flex-end", fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  totals: { gap: 4 },
  total: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  net: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.primary },
  steps: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  step: { fontSize: fontSize.body, lineHeight: 20, color: colors.foreground },
  notes: { flexDirection: "row", gap: spacing.sm },
  small: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  link: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  navBody: { gap: spacing.md, padding: spacing.lg },
  navTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
});
