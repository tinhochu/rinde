import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeftRight, Clock3, ExternalLink, ShoppingBag } from "lucide-react-native";
import { Assignment, cop, Offer, quantityLabel } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { Accordion } from "./ui";
import { GroceryImage } from "./grocery-image";

export function OfferLine({ assignment: a, offers, now, onEdit }: { assignment: Assignment; offers: Offer[]; now: number; onEdit: () => void }) {
  const mins = Math.max(0, Math.floor((now - new Date(a.offer.observedAt).getTime()) / 60000));
  const exact = a.offer.ean ? offers.filter(o => o.ean === a.offer.ean && o.pack === a.offer.pack && o.unit === a.offer.unit) : [];
  const comparable = Array.from(new Set(exact.map(o => o.store))).map(store => exact.filter(o => o.store === store).sort((x, y) => x.price - y.price)[0]);
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {a.offer.image ? (
          <GroceryImage src={a.offer.image} alt={a.offer.name} contain size={22} style={styles.thumb} />
        ) : (
          <View style={styles.thumbFallback}>
            <ShoppingBag size={22} color={colors.primary} />
          </View>
        )}
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{a.offer.name}</Text>
            <Text style={styles.total} selectable>{cop(a.total)}</Text>
          </View>
          <Text style={styles.sub}>{a.packs} × {quantityLabel(a.offer.pack, a.offer.unit)} · {cop(a.offer.price)} / empaque</Text>
          <Text style={styles.sub}>
            Necesitas {quantityLabel(a.item.quantity, a.item.unit)}
            {a.offer.unit !== "und" && ` · ${cop(Math.round(a.offer.price / a.offer.pack * 1000))} / ${a.offer.unit === "g" ? "kg" : "L"}`}
          </Text>
          <View style={styles.freshRow}>
            <Clock3 size={11} color={mins >= 5 ? colors.staleInk : colors.mutedForeground} />
            <Text style={[styles.fresh, mins >= 5 && styles.stale]}>
              {a.offer.store} · Tienda online · {mins ? `Verificado hace ${mins} min` : "Verificado ahora"}{mins >= 5 && " · Requiere actualización"}
            </Text>
          </View>
          <Pressable onPress={() => Linking.openURL(a.offer.url)} style={styles.linkRow}>
            <Text style={styles.link}>Comprobar en la tienda</Text>
            <ExternalLink size={11} color={colors.primary} />
          </Pressable>
          <Accordion title={`Datos de verificación${comparable.length > 1 ? ` · Mismo EAN en ${comparable.length} tiendas` : ""}`}>
            <Text style={styles.detail}>{new Date(a.offer.observedAt).toLocaleString("es-CO")} · EAN: {a.offer.ean || "No informado. No se afirma coincidencia exacta."}</Text>
            {comparable.length > 1 && (
              <View style={styles.comparable}>
                <Text style={styles.comparableTitle}>Mismo código de barras y presentación</Text>
                {comparable.map(o => (
                  <Pressable key={o.store} onPress={() => Linking.openURL(o.url)}>
                    <Text style={styles.detail}>
                      <Text style={styles.strong}>{o.store}: {cop(o.price)} / empaque</Text>
                      {"\n"}Tienda online · {new Date(o.observedAt).toLocaleString("es-CO")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Accordion>
        </View>
      </View>
      {a.substitution && a.alternative && a.alternative.total > a.total && (
        <View style={styles.swap}>
          <ArrowLeftRight size={15} color={colors.primary} style={styles.swapIcon} />
          <View style={styles.swapBody}>
            <Text style={styles.swapTitle}>Otra marca, {cop(a.alternative.total - a.total)} menos.</Text>
            <Text style={styles.swapText}>Mismo producto y tamaño de empaque; cambia de {a.item.brand} a {a.offer.brand}.</Text>
            <Pressable onPress={() => Linking.openURL(a.alternative!.offer.url)}>
              <Text style={styles.swapBefore}>
                Antes: {cop(a.alternative.total)} · {a.alternative.offer.store} · Online · {new Date(a.alternative.offer.observedAt).toLocaleString("es-CO")}
              </Text>
            </Pressable>
            <Pressable onPress={onEdit}>
              <Text style={styles.swapEdit}>Revisar o rechazar cambio</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 56, height: 64, borderRadius: radius.sm },
  thumbFallback: {
    width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.secondary,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  main: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.subhead, fontWeight: "600", lineHeight: 20 },
  total: { fontSize: fontSize.title, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  sub: { fontSize: fontSize.caption, color: colors.mutedForeground },
  freshRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  fresh: { fontSize: fontSize.small, color: colors.mutedForeground, flex: 1 },
  stale: { color: colors.staleInk },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  link: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  detail: { fontSize: fontSize.small, lineHeight: 18, color: colors.mutedForeground },
  strong: { fontWeight: "700", color: colors.primary },
  comparable: { marginTop: spacing.sm, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md },
  comparableTitle: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  swap: { flexDirection: "row", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.md },
  swapIcon: { marginTop: 4 },
  swapBody: { flex: 1, gap: 4 },
  swapTitle: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  swapText: { fontSize: fontSize.caption, lineHeight: 18, color: colors.primary },
  swapBefore: { fontSize: fontSize.small, color: colors.primary, textDecorationLine: "underline" },
  swapEdit: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary, textDecorationLine: "underline", marginTop: 4 },
});
