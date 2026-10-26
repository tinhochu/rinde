import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { ArrowRight, Check, Info, Plus, Trash2 } from "lucide-react-native";
import { Button, Chip } from "@/components/ui";
import { ListItem, Unit } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { inputStyle } from "@/components/ui";

export function ReviewStep({ items, onNext }: { items: ListItem[]; onNext: (items: ListItem[]) => void }) {
  const { control, handleSubmit, formState: { errors } } = useForm<{ items: ListItem[] }>({ defaultValues: { items } });
  const { fields, remove, append } = useFieldArray({ control, name: "items", keyName: "fieldKey" });
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>Tú tienes la última palabra</Text>
      <Text style={styles.hero}>¿Así está bien tu lista?</Text>
      <Text style={styles.lede}>Confirma cantidades y marcas. Buscaremos empaques suficientes para lo que necesitas.</Text>

      <View style={styles.list}>
        {fields.map((field, index) => (
          <View key={field.fieldKey} style={styles.item}>
            <View style={styles.itemRow}>
              <View style={styles.index}>
                <Text style={styles.indexText}>{index + 1}</Text>
              </View>
              <View style={styles.fields}>
                <Text style={styles.label}>Producto</Text>
                <Controller
                  control={control}
                  name={`items.${index}.name`}
                  rules={{ required: true, minLength: 2, maxLength: 100 }}
                  render={({ field: { onChange, value } }) => (
                    <TextInput accessibilityLabel={`Producto ${index + 1}`} value={value} onChangeText={onChange} style={inputStyle} />
                  )}
                />
                <View style={styles.qtyRow}>
                  <View style={styles.qtyField}>
                    <Text style={styles.label}>Cantidad</Text>
                    <Controller
                      control={control}
                      name={`items.${index}.quantity`}
                      rules={{ required: true, min: 0.01, max: 1000000 }}
                      render={({ field: { onChange, value } }) => (
                        <TextInput
                          accessibilityLabel={`Cantidad ${index + 1}`}
                          keyboardType="decimal-pad"
                          value={String(value ?? "")}
                          onChangeText={text => onChange(Number(text.replace(",", ".")) || 0)}
                          style={inputStyle}
                        />
                      )}
                    />
                  </View>
                  <View style={styles.unitField}>
                    <Text style={styles.label}>Unidad</Text>
                    <Controller
                      control={control}
                      name={`items.${index}.unit`}
                      render={({ field: { onChange, value } }) => (
                        <View style={styles.unitRow}>
                          {(["g", "ml", "und"] as Unit[]).map(u => (
                            <Chip key={u} selected={value === u} onPress={() => onChange(u)}>{u}</Chip>
                          ))}
                        </View>
                      )}
                    />
                  </View>
                </View>
                <Text style={styles.label}>Marca preferida <Text style={styles.optional}>(opcional)</Text></Text>
                <Controller
                  control={control}
                  name={`items.${index}.brand`}
                  rules={{ maxLength: 80 }}
                  render={({ field: { onChange, value } }) => (
                    <TextInput value={value} onChangeText={onChange} placeholder="Cualquiera" style={inputStyle} />
                  )}
                />
              </View>
              <Pressable accessibilityLabel={`Quitar producto ${index + 1}`} onPress={() => remove(index)} style={styles.trash}>
                <Trash2 size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.swapRow}>
              <Controller
                control={control}
                name={`items.${index}.allowSubstitution`}
                render={({ field: { onChange, value } }) => (
                  <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} thumbColor={colors.card} />
                )}
              />
              <Text style={styles.swapText}>Permitir otra marca, solo para el mismo producto y tamaño de empaque.</Text>
            </View>
          </View>
        ))}
      </View>

      {Object.keys(errors).length > 0 && <Text style={styles.error}>Revisa los nombres y las cantidades: deben ser mayores que cero.</Text>}

      <Pressable
        disabled={fields.length >= 20}
        onPress={() => append({ id: Crypto.randomUUID(), name: "", quantity: 1, unit: "und", brand: "", allowSubstitution: true })}
        style={[styles.append, fields.length >= 20 && styles.appendDisabled]}
      >
        <Plus size={16} color={colors.primary} />
        <Text style={styles.appendText}>Agregar otro producto</Text>
      </Pressable>

      <View style={styles.infoBox}>
        <Info size={18} color={colors.primary} />
        <Text style={styles.infoText}>
          1 kg = 1.000 gramos · 1 litro = 1.000 ml. Los precios son del canal online. La entrega y disponibilidad en tu barrio se confirman con la tienda; no incluimos domicilios ni transporte.
        </Text>
      </View>

      <Button title="Buscar dónde rinde más" disabled={!fields.length} onPress={() => void handleSubmit(v => onNext(v.items))()} icon={<ArrowRight size={18} color="#FFFFFF" />} />

      <View style={styles.footer}>
        <Check size={13} color={colors.mutedForeground} />
        <Text style={styles.footerText}>Solo precios observados en los catálogos de las tiendas.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  kicker: { fontSize: fontSize.caption, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2, color: colors.accent },
  hero: { fontSize: fontSize.hero, fontWeight: "800", letterSpacing: -1.3, color: colors.primary },
  lede: { fontSize: fontSize.subhead, lineHeight: 26, color: colors.mutedForeground },
  list: { gap: spacing.md },
  item: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg, gap: spacing.md },
  itemRow: { flexDirection: "row", gap: spacing.md },
  index: {
    marginTop: 24, width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center",
  },
  indexText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  fields: { flex: 1, gap: spacing.sm },
  label: { fontSize: fontSize.small, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, color: colors.mutedForeground },
  optional: { fontWeight: "400", textTransform: "none", letterSpacing: 0 },
  qtyRow: { flexDirection: "row", gap: spacing.md },
  qtyField: { flex: 1, gap: spacing.sm },
  unitField: { flex: 1, gap: spacing.sm },
  unitRow: { flexDirection: "row", gap: spacing.sm },
  trash: { padding: 6, alignSelf: "flex-start", marginTop: 20 },
  swapRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginLeft: 40 },
  swapText: { flex: 1, fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  error: { fontSize: fontSize.subhead, color: colors.destructive },
  append: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  appendDisabled: { opacity: 0.5 },
  appendText: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.primary },
  infoBox: { flexDirection: "row", gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.secondary, padding: spacing.lg },
  infoText: { flex: 1, fontSize: fontSize.caption, lineHeight: 20, color: colors.primary },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  footerText: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
