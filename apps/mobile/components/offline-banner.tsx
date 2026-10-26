import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WifiOff } from "lucide-react-native";
import { useAppState } from "@/lib/app-state";
import { colors, fontSize, spacing } from "@/lib/theme";

export function OfflineBanner() {
  const { offline } = useAppState();
  if (!offline) return null;
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.banner}>
        <WifiOff size={14} color={colors.warnInk} />
        <Text style={styles.text}>Sin conexión. Puedes preparar tu canasta; consultar precios requiere internet.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 90, backgroundColor: "#FFF4E8" },
  banner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  text: { fontSize: fontSize.small, color: colors.warnInk, textAlign: "center", flexShrink: 1 },
});
