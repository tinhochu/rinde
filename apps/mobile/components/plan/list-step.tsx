import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ArrowRight, Camera, Check, FileText, ImagePlus, ListPlus, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react-native";
import { Button, Chip } from "@/components/ui";
import { extractPhoto } from "@/lib/api";
import { ListItem, parseList, Unit } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { inputStyle, labelStyle } from "@/components/ui";
import { toast } from "@/lib/toast";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export function ListStep({ initial, onNext }: { initial: ListItem[]; onNext: (items: ListItem[]) => void }) {
  const [tab, setTab] = useState<"photo" | "text" | "manual">("text");
  const [items, setItems] = useState<ListItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");
  const { control, handleSubmit, setValue } = useForm<{ text: string; name: string; quantity: number; unit: Unit }>({
    defaultValues: { text: initial.map(i => `${i.quantity} ${i.unit} de ${i.name}`).join("\n"), name: "", quantity: 1, unit: "und" },
  });

  async function pick(fromCamera: boolean) {
    setError("");
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Necesitamos permiso para usar tus fotos.");
      return;
    }
    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset.mimeType || !ACCEPTED.includes(asset.mimeType) || (asset.fileSize && asset.fileSize > MAX_BYTES)) {
      setError("Elige una foto JPG, PNG o WebP de máximo 8 MB.");
      return;
    }
    setPreview(asset.uri);
    setBusy(true);
    try {
      const result = await extractPhoto(asset.uri, asset.mimeType);
      if (!result.items.length) throw new Error("No encontramos productos legibles. Prueba otra foto o escribe tu lista.");
      onNext(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos leer tu foto.");
    } finally {
      setBusy(false);
    }
  }

  function submit(values: { text: string }) {
    const parsed = tab === "manual" ? items : parseList(values.text);
    if (!parsed.length) {
      setError("Añade al menos un producto para continuar.");
      return;
    }
    setError("");
    onNext(parsed);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>De tu cocina a tu lista</Text>
      <Text style={styles.hero}>¿Qué hace falta en casa?</Text>
      <Text style={styles.lede}>Como te quede más fácil. Después revisamos juntos cada producto y cantidad.</Text>

      <View style={styles.card}>
        <View style={styles.tabs}>
          {[
            { id: "photo", icon: <Camera size={16} color={tab === "photo" ? colors.primary : colors.mutedForeground} />, label: "Una foto" },
            { id: "text", icon: <FileText size={16} color={tab === "text" ? colors.primary : colors.mutedForeground} />, label: "Escribir lista" },
            { id: "manual", icon: <ListPlus size={16} color={tab === "manual" ? colors.primary : colors.mutedForeground} />, label: "Uno por uno" },
          ].map(t => (
            <Pressable
              key={t.id}
              onPress={() => {
                setTab(t.id as typeof tab);
                setError("");
              }}
              style={[styles.tab, tab === t.id && styles.tabActive]}
            >
              {t.icon}
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "photo" ? (
          <View style={styles.photoBody}>
            {preview ? (
              <Image source={{ uri: preview }} style={styles.preview} contentFit="contain" />
            ) : (
              <View style={styles.photoEmpty}>
                <View style={styles.photoIcon}>
                  <ImagePlus size={38} strokeWidth={1.4} color={colors.primary} />
                </View>
              </View>
            )}
            <View style={styles.photoButtons}>
              <Button title={busy ? "Leyendo tu lista…" : "Tomar una foto"} onPress={() => pick(true)} loading={busy} icon={<Camera size={17} color="#FFFFFF" />} />
              <Button title="Elegir de la galería" variant="outline" disabled={busy} onPress={() => pick(false)} />
            </View>
            <Text style={styles.hint}>Lista completa, buena luz y letra visible · Hasta 8 MB</Text>
            <View style={styles.aiNote}>
              <Sparkles size={15} color={colors.accent} />
              <Text style={styles.aiNoteText}>La IA lee los productos, nunca inventa precios. Tú confirmas el resultado.</Text>
            </View>
            {busy && (
              <View style={styles.busyRow}>
                <LoaderCircle size={18} color={colors.primary} />
                <Text style={styles.busyText}>Extrayendo productos y cantidades</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.formBody}>
            {tab === "text" ? (
              <>
                <Text style={labelStyle}>Escribe como le contarías a alguien</Text>
                <Controller
                  control={control}
                  name="text"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      multiline
                      numberOfLines={7}
                      value={value}
                      onChangeText={onChange}
                      placeholder={"2 kg de arroz\n1 litro de aceite\n30 huevos\n1 kg de lentejas"}
                      style={[inputStyle, styles.textarea]}
                      textAlignVertical="top"
                    />
                  )}
                />
                <View style={styles.textRow}>
                  <Text style={styles.hint}>Un producto por línea. Incluye cantidades y presentación.</Text>
                  <Pressable onPress={() => setValue("text", "2 kg de arroz\n1 litro de aceite\n30 huevos\n1 kg de lentejas\n2 litros de leche\n500 g de pasta")}>
                    <Text style={styles.example}>Usar lista de ejemplo</Text>
                  </Pressable>
                </View>
                <Text style={styles.rulesNote}>La lista escrita se separa con reglas de texto, sin IA. Revisa cantidades, unidades y marcas en el siguiente paso.</Text>
              </>
            ) : (
              <>
                <Text style={labelStyle}>¿Qué agregamos?</Text>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, value } }) => (
                    <TextInput value={value} onChangeText={onChange} placeholder="Ej. arroz blanco" style={inputStyle} />
                  )}
                />
                <View style={styles.manualRow}>
                  <Controller
                    control={control}
                    name="quantity"
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        accessibilityLabel="Cantidad"
                        keyboardType="numeric"
                        value={String(value ?? "")}
                        onChangeText={text => onChange(Number(text.replace(/\D/g, "")) || 0)}
                        style={[inputStyle, styles.qtyInput]}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="unit"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.unitRow}>
                        {(["und", "g", "ml"] as Unit[]).map(u => (
                          <Chip key={u} selected={value === u} onPress={() => onChange(u)}>{u}</Chip>
                        ))}
                      </View>
                    )}
                  />
                  <Pressable
                    accessibilityLabel="Agregar producto"
                    onPress={() => {
                      void handleSubmit(v => {
                        if (!v.name.trim() || !Number.isFinite(v.quantity) || v.quantity <= 0) {
                          toast.error("Escribe un producto y una cantidad válida.");
                          return;
                        }
                        if (items.length >= 20) {
                          toast.error("Puedes comparar hasta 20 productos por lista.");
                          return;
                        }
                        setItems([...items, { id: Crypto.randomUUID(), name: v.name.trim(), quantity: v.quantity, unit: v.unit, brand: "", allowSubstitution: true }]);
                        setValue("name", "");
                      })();
                    }}
                    style={styles.addButton}
                  >
                    <Plus size={19} color="#FFFFFF" />
                  </Pressable>
                </View>
                <View style={styles.manualList}>
                  {items.length ? (
                    items.map(item => (
                      <View key={item.id} style={styles.manualItem}>
                        <Text style={styles.manualName}>
                          {item.name} <Text style={styles.manualQty}>{item.quantity} {item.unit}</Text>
                        </Text>
                        <Pressable accessibilityLabel={`Quitar ${item.name}`} onPress={() => setItems(items.filter(i => i.id !== item.id))} style={styles.trash}>
                          <Trash2 size={15} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.manualEmpty}>Tu mercado empieza con el primer producto.</Text>
                  )}
                </View>
              </>
            )}
            <Button
              title="Revisar mi lista"
              onPress={() => {
                void handleSubmit(submit)();
              }}
              icon={<ArrowRight size={18} color="#FFFFFF" />}
            />
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        <Check size={14} color={colors.primary} />
        <Text style={styles.footerText}>Nada se compra ni se paga desde Rinde.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  kicker: { fontSize: fontSize.caption, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2, color: colors.accent },
  hero: { fontSize: fontSize.hero, fontWeight: "800", letterSpacing: -1.3, color: colors.primary },
  lede: { fontSize: fontSize.subhead, lineHeight: 26, color: colors.mutedForeground },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.lg },
  tabs: { flexDirection: "row", gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.muted, padding: 6 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, paddingVertical: spacing.md },
  tabActive: { backgroundColor: colors.card, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  tabText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  tabTextActive: { color: colors.primary },
  photoBody: { gap: spacing.md, alignItems: "stretch" },
  photoEmpty: {
    minHeight: 200, borderRadius: radius.lg, borderWidth: 2, borderStyle: "dashed", borderColor: colors.primary,
    backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center",
  },
  photoIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  preview: { width: "100%", height: 220, borderRadius: radius.lg, backgroundColor: colors.muted },
  photoButtons: { gap: spacing.sm },
  hint: { fontSize: fontSize.caption, color: colors.mutedForeground, textAlign: "center" },
  aiNote: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  aiNoteText: { flex: 1, fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  busyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  busyText: { fontSize: fontSize.subhead, color: colors.primary },
  formBody: { gap: spacing.md },
  textarea: { minHeight: 180, lineHeight: 28, fontSize: 16 },
  textRow: { gap: spacing.sm },
  example: { fontSize: fontSize.caption, fontWeight: "600", color: colors.primary },
  rulesNote: { borderRadius: radius.md, backgroundColor: colors.secondary, padding: spacing.md, fontSize: fontSize.caption, lineHeight: 18, color: colors.primary },
  manualRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  qtyInput: { width: 80 },
  unitRow: { flexDirection: "row", gap: spacing.sm, flex: 1 },
  addButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  manualList: { gap: spacing.sm },
  manualItem: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md },
  manualName: { flex: 1, fontSize: fontSize.subhead },
  manualQty: { fontSize: fontSize.caption, color: colors.mutedForeground },
  trash: { padding: spacing.sm },
  manualEmpty: { borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: spacing.xl, textAlign: "center", fontSize: fontSize.subhead, color: colors.mutedForeground },
  error: { borderRadius: radius.md, backgroundColor: "#FFF4E8", padding: spacing.lg, fontSize: fontSize.subhead, lineHeight: 22, color: colors.warnInk },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  footerText: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
