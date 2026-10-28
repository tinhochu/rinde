import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Compass, EllipsisVertical, Share, SquarePlus } from "lucide-react-native";
import type { InstallWay } from "@/lib/install";
import { colors, fontSize, spacing } from "@/lib/theme";

/** The taps that add Rinde to the home screen where the browser can't do it in one ("prompt" needs none). */
export function InstallSteps({ way }: { way: InstallWay }) {
  if (way === "ios") {
    return (
      <View style={styles.steps}>
        <Step n={1} icon={<Share size={18} color={colors.primary} />}>
          Toca <Text style={styles.strong}>Compartir</Text> en la barra del navegador. Si no lo ves, toca primero <Text style={styles.strong}>···</Text>.
        </Step>
        <Step n={2} icon={<SquarePlus size={18} color={colors.primary} />}>
          Baja en el menú y elige <Text style={styles.strong}>Agregar a inicio</Text>.
        </Step>
        <Step n={3} icon={<Text style={styles.add}>Agregar</Text>}>
          Confirma con <Text style={styles.strong}>Agregar</Text>. Rinde queda junto a tus apps.
        </Step>
      </View>
    );
  }
  if (way === "android") {
    return (
      <View style={styles.steps}>
        <Step n={1} icon={<EllipsisVertical size={18} color={colors.primary} />}>
          Toca el menú <Text style={styles.strong}>⋮</Text> arriba a la derecha del navegador.
        </Step>
        <Step n={2} icon={<SquarePlus size={18} color={colors.primary} />}>
          Elige <Text style={styles.strong}>Instalar app</Text> o <Text style={styles.strong}>Agregar a pantalla principal</Text>.
        </Step>
        <Step n={3} icon={<Text style={styles.add}>Instalar</Text>}>
          Confirma. Rinde queda junto a tus apps.
        </Step>
      </View>
    );
  }
  if (way === "inapp") {
    return (
      <View style={styles.steps}>
        <Step n={1} icon={<EllipsisVertical size={18} color={colors.primary} />}>
          Este navegador es de otra app y no puede instalar. Toca <Text style={styles.strong}>···</Text> o <Text style={styles.strong}>⋮</Text> arriba.
        </Step>
        <Step n={2} icon={<Compass size={18} color={colors.primary} />}>
          Elige <Text style={styles.strong}>Abrir en el navegador</Text> (Chrome o Safari). Si no aparece, copia el enlace y pégalo ahí.
        </Step>
        <Step n={3} icon={<SquarePlus size={18} color={colors.primary} />}>
          Allá Rinde te muestra cómo instalarla.
        </Step>
      </View>
    );
  }
  return null;
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.number}><Text style={styles.numberText}>{n}</Text></View>
      <Text style={styles.text}>{children}</Text>
      <View style={styles.icon}>{icon}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { gap: spacing.md },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  number: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: fontSize.small, fontWeight: "800", color: colors.secondaryForeground },
  text: { flex: 1, fontSize: fontSize.body, lineHeight: 21, color: colors.foreground },
  icon: { width: 64, alignItems: "flex-end" },
  strong: { fontWeight: "800" },
  add: { fontSize: fontSize.small, fontWeight: "700", color: "#0A84FF" },
});
