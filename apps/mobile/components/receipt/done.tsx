import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Award, Check, ScanLine } from "lucide-react-native";
import { Pop } from "@/components/motion";
import { Button } from "@/components/ui";
import type { ConfirmResult } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** After sending: what was earned and why, line by line category, and any new badge. */
export function ReceiptDone({ result, store, einvoice, onAnother, onRewards, onHome, onAccount }: {
  result: ConfirmResult; store: string; /** Read from a DIAN e-invoice's XML */ einvoice?: boolean;
  onAnother: () => void; onRewards: () => void; onHome: () => void; onAccount: () => void;
}) {
  const saved = result.acceptedLines;
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.check}><Check size={26} color="#FFFFFF" strokeWidth={3} /></View>
          {result.free ? (
            <Text accessibilityRole="header" style={styles.sent}>Precios enviados</Text>
          ) : (
            <Pop value={result.points}>
              <Text accessibilityRole="header" style={styles.points}>+{result.points} puntos</Text>
            </Pop>
          )}
          <Text style={styles.lede}>
            {saved === 1 ? "Guardamos 1 precio" : `Guardamos ${saved} precios`} de {store}. Desde ya aparecen como “Reportado en tienda · {einvoice ? "factura electrónica" : "factura"}” para tus vecinos.
          </Text>
        </View>

        {result.breakdown.length > 0 && (
          <View style={styles.card}>
            {result.breakdown.map((b, i) => (
              <View key={b.label} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowLabel}>{b.label}</Text>
                  <Text style={styles.rowMeta}>{b.lines === 1 ? "1 producto" : `${b.lines} productos`}</Text>
                </View>
                <Text style={styles.rowPoints}>+{b.points}</Text>
              </View>
            ))}
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={[styles.rowLabel, styles.rowBody]}>Tu saldo</Text>
              <Text style={styles.balance}>{result.balance} puntos</Text>
            </View>
          </View>
        )}

        {result.badges.map(b => (
          <View key={b.id} style={styles.badge}>
            <View style={styles.badgeIcon}><Award size={22} color={colors.accent} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.badgeKicker}>Nueva insignia</Text>
              <Text style={styles.badgeName}>{b.name}</Text>
              <Text style={styles.rowMeta}>{b.description}</Text>
            </View>
          </View>
        ))}

        {result.free && (
          <View style={styles.badge}>
            <View style={styles.badgeIcon}><Award size={22} color={colors.accent} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.badgeName}>Gracias por ayudar gratis</Text>
              <Text style={styles.rowMeta}>Con una cuenta, tu próxima factura suma puntos para el ranking de tu zona e insignias. Los puntos se guardan en tu cuenta, así no se pierden si cambias de celular.</Text>
            </View>
          </View>
        )}

        <Text style={styles.note}>Los puntos no tienen valor en dinero. Sirven para el ranking de tu zona y tus insignias.</Text>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        {result.free ? <Button title="Crear cuenta" onPress={onAccount} /> : <Button title="Ver mis puntos" onPress={onRewards} />}
        <View style={styles.footerRow}>
          <View style={styles.flex}><Button title="Otra factura" variant="outline" onPress={onAnother} icon={<ScanLine size={15} color={colors.primary} />} /></View>
          <View style={styles.flex}><Button title="Ir al inicio" variant="outline" onPress={onHome} /></View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.xl },
  check: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sent: { fontSize: fontSize.title, fontWeight: "900", color: colors.primary },
  points: { fontSize: fontSize.hero, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] },
  lede: { textAlign: "center", fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground, maxWidth: 320 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  rowMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
  rowPoints: { fontSize: fontSize.title, fontWeight: "800", color: colors.primary, fontVariant: ["tabular-nums"] },
  balance: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  badge: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.photoFrame },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  badgeKicker: { fontSize: fontSize.caption, fontWeight: "700", color: colors.warnInk },
  badgeName: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  note: { textAlign: "center", fontSize: fontSize.caption, color: colors.mutedForeground },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  footerRow: { flexDirection: "row", gap: spacing.sm },
});
