import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, ScanLine } from "lucide-react-native";
import { PressScale } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** End of the results: online prices are only part of the picture, and a receipt fills in the rest. */
export function ReceiptPrompt() {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel="Escanear factura. Comparte lo que pagaste en la tienda" onPress={() => router.push("/receipt")} scaleTo={0.98} style={styles.card}>
      <View style={styles.icon}><ScanLine size={20} color={colors.primary} /></View>
      <View style={styles.body}>
        <Text style={styles.title}>¿Compraste algo de esto?</Text>
        <Text style={styles.text}>Escanea tu factura y comparte lo que pagaste en la tienda. Ganas puntos por cada precio.</Text>
      </View>
      <ChevronRight size={18} color={colors.primary} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.secondaryBorder, backgroundColor: colors.secondary,
  },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.secondaryForeground },
  text: { fontSize: fontSize.caption, lineHeight: 16, color: colors.secondaryForeground },
});
