import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Scale } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { cop, quantityLabel } from "@/lib/market";
import { perLabel, type ValuePick } from "@/lib/value";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const BUDGET = 10000;

/** "526 g", "1,2 kg", "2,5 L", "22 und": how much a sum buys at a price per base unit. */
function amountFor(pesos: number, perBase: number, unit: ValuePick["unit"]) {
  const amount = pesos / perBase;
  if (unit === "und") return `${Math.floor(amount)} und`;
  const big = unit === "g" ? "kg" : "L";
  return amount >= 1000 ? `${(amount / 1000).toFixed(1).replace(".", ",")} ${big}` : `${Math.floor(amount)} ${unit}`;
}

/**
 * "La que más rinde": per kind of product (brand aside), the one with the lowest price per kg, L or
 * unit, and what the same money buys against the kind's typical price. Tapping opens the product.
 */
export function ValuePicks({ picks, onOpen }: { picks: ValuePick[]; onOpen: (pick: ValuePick) => void }) {
  if (!picks.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Scale size={16} color={colors.primary} />
        <Text accessibilityRole="header" style={styles.title}>La que más rinde</Text>
      </View>
      <Text style={styles.lede}>Sin importar la marca: el menor precio por {picks[0]!.unit === "und" ? "unidad" : picks[0]!.unit === "ml" ? "litro" : "kilo"} de cada tipo.</Text>
      {picks.slice(0, 3).map(pick => {
        const per = perLabel(pick.best.perBase, pick.unit);
        const more = Math.round((pick.typical / pick.best.perBase - 1) * 100);
        return (
          <Pressable
            key={pick.label}
            accessibilityRole="button"
            accessibilityLabel={`${pick.label}: ${pick.best.product.name} en ${pick.best.offer.store}, ${cop(per.value)} por ${per.per}`}
            onPress={() => onOpen(pick)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Image source={{ uri: pick.best.product.image }} style={styles.image} />
            <View style={styles.body}>
              <Text style={styles.kind}>{pick.label} · {pick.compared} comparados</Text>
              <Text numberOfLines={1} style={styles.name}>{pick.best.product.name}</Text>
              <View style={styles.priceRow}>
                <StoreLogo store={pick.best.offer.store} small />
                <Text style={styles.per}>{cop(per.value)}/{per.per}</Text>
                <Text style={styles.pack}>{cop(pick.best.offer.price)} · {quantityLabel(pick.best.offer.pack, pick.best.offer.unit)}</Text>
              </View>
              <Text style={styles.gain}>
                Con {cop(BUDGET)} llevas {amountFor(BUDGET, pick.best.perBase, pick.unit)}; a precio típico de este tipo, {amountFor(BUDGET, pick.typical, pick.unit)}{more > 0 ? `. Te rinde ${more} % más` : ""}.
              </Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        );
      })}
      <Text style={styles.note}>
        Meta Muse agrupa los productos del mismo tipo; el precio por {picks[0]!.unit === "und" ? "unidad" : "kilo"} sale del precio y el tamaño que publica cada tienda.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.secondaryBorder, backgroundColor: colors.secondary },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: fontSize.title, fontWeight: "800", color: colors.secondaryForeground },
  lede: { marginTop: -4, fontSize: fontSize.caption, lineHeight: 16, color: colors.secondaryForeground },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.card },
  pressed: { opacity: 0.75 },
  image: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.imageBg },
  body: { flex: 1, minWidth: 0, gap: 2 },
  kind: { fontSize: fontSize.caption, fontWeight: "800", color: colors.primary },
  name: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  per: { fontSize: fontSize.subhead, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] },
  pack: { fontSize: fontSize.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  gain: { fontSize: fontSize.caption, lineHeight: 16, color: colors.foreground },
  note: { fontSize: fontSize.small, lineHeight: 14, color: colors.secondaryForeground },
});
