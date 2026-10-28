import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Sheet, labelStyle } from "@/components/ui";
import { DEFAULT_COSTS, type TravelCosts, type TravelPrefs } from "@/lib/route";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const FIELDS: { key: keyof TravelCosts; label: string; hint: string }[] = [
  { key: "busFare", label: "Pasaje de bus o TransMilenio", hint: "por viaje" },
  { key: "motoPerKm", label: "Moto: gasolina y desgaste", hint: "por km" },
  { key: "carPerKm", label: "Carro: gasolina y desgaste", hint: "por km" },
  { key: "parking", label: "Parqueadero del carro", hint: "por parada" },
];

/** What a trip costs this person, per mode. Saved on the device for the next plans. */
export function TravelCostsSheet({ visible, travel, onClose, onSave }: {
  visible: boolean; travel: TravelPrefs; onClose: () => void; onSave: (t: TravelPrefs) => void;
}) {
  const [draft, setDraft] = useState<Record<keyof TravelCosts, string>>(texts(travel));
  useEffect(() => { if (visible) setDraft(texts(travel)); }, [visible, travel]);

  function save() {
    const next = { ...travel };
    for (const { key } of FIELDS) {
      const n = Number(draft[key].replace(/\D/g, ""));
      next[key] = Number.isFinite(n) && draft[key].trim() ? Math.min(n, 100_000) : DEFAULT_COSTS[key];
    }
    onSave(next);
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>Costos de tu trayecto</Text>
        <Text style={styles.lede}>Con esto calculamos cuánto te cuesta pasar por otra tienda. A pie no cuesta nada.</Text>
        {FIELDS.map(f => (
          <View key={f.key} style={styles.field}>
            <Text style={labelStyle}>{f.label}</Text>
            <View style={styles.inputRow}>
              <Text style={styles.prefix}>$</Text>
              <TextInput
                value={draft[f.key]}
                onChangeText={t => setDraft(d => ({ ...d, [f.key]: t }))}
                keyboardType="number-pad"
                style={styles.input}
                accessibilityLabel={`${f.label}, ${f.hint}`}
              />
              <Text style={styles.suffix}>{f.hint}</Text>
            </View>
          </View>
        ))}
        <Button title="Guardar costos" onPress={save} />
      </View>
    </Sheet>
  );
}

function texts(t: TravelCosts): Record<keyof TravelCosts, string> {
  return { busFare: String(t.busFare), motoPerKm: String(t.motoPerKm), carPerKm: String(t.carPerKm), parking: String(t.parking) };
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, padding: spacing.lg },
  title: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  lede: { fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  field: { gap: spacing.xs },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 46,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  prefix: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.mutedForeground },
  input: { flex: 1, fontSize: fontSize.subhead, color: colors.foreground, paddingVertical: spacing.sm, fontVariant: ["tabular-nums"] },
  suffix: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
