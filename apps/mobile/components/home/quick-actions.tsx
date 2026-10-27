import { StyleSheet, Text, View } from "react-native";
import { ListChecks, ScanLine } from "lucide-react-native";
import { PressScale } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** The two ways in besides search: a whole list, or a receipt. */
export function QuickActions({ onList, onReceipt }: { onList: () => void; onReceipt: () => void }) {
  return (
    <View style={styles.row}>
      <PressScale accessibilityRole="button" accessibilityLabel="Crear mi lista. Compara todo tu mercado." onPress={onList} style={[styles.card, styles.primary]}>
        <View style={[styles.icon, styles.iconPrimary]}>
          <ListChecks size={20} color="#FFFFFF" />
        </View>
        <Text style={[styles.title, styles.titlePrimary]}>Crear mi lista</Text>
        <Text style={[styles.text, styles.textPrimary]}>Compara todo tu mercado</Text>
      </PressScale>
      <PressScale accessibilityRole="button" accessibilityLabel="Escanear factura. Disponible pronto." onPress={onReceipt} style={styles.card}>
        <View style={styles.icon}>
          <ScanLine size={20} color={colors.primary} />
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Escanear factura</Text>
        </View>
        <Text style={styles.text}>Pronto: gana puntos por tus precios</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  card: {
    flex: 1, gap: 2, minHeight: 104, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  icon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  iconPrimary: { backgroundColor: "rgba(255,255,255,0.18)" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  titlePrimary: { color: "#FFFFFF" },
  text: { fontSize: fontSize.caption, lineHeight: 15, color: colors.mutedForeground },
  textPrimary: { color: "rgba(255,255,255,0.85)" },
});
