import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { AlertTriangle, Check, ChevronRight, Pencil, Tag } from "lucide-react-native";
import { cop } from "@/lib/market";
import { lineCheck, type ReviewLine } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const ISSUE: Record<"illegible" | "mismatch", string> = {
  illegible: "Revisa este precio",
  mismatch: "Los números no cuadran",
};

/** Whether this line will be saved as a price (and earn points) if sent as it is now. */
export function lineCounts(line: ReviewLine) {
  return !line.excluded && line.kind === "item" && lineCheck(line) === "ok" && !line.noMatch && !!line.match;
}

/**
 * One receipt line: the printed text, quantity × price = total (editable), its check, the product it
 * matched, and whether to include it. Edits rerun the same check the API runs on confirm.
 */
export function LineRow({ line, onChange, onPickProduct }: {
  line: ReviewLine; onChange: (next: ReviewLine) => void; onPickProduct: () => void;
}) {
  const check = lineCheck(line);
  const [editing, setEditing] = useState(check !== "ok" && line.kind === "item");
  const counts = lineCounts(line);
  const qty = line.quantity;
  const weighed = qty && qty.unit !== "unit";

  if (line.kind === "discount") {
    return (
      <View style={[styles.row, styles.discount, line.excluded && styles.off]}>
        <Tag size={14} color={colors.mutedForeground} />
        <Text numberOfLines={1} style={styles.discountText}>{line.text}</Text>
        <Text style={styles.discountTotal}>{line.total === null ? "—" : cop(line.total)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, check !== "ok" && !line.excluded && styles.rowIssue, line.excluded && styles.off]}>
      <View style={styles.top}>
        <Text style={styles.text} numberOfLines={2}>{line.text}</Text>
        <Switch
          accessibilityLabel={line.excluded ? `Incluir ${line.text}` : `No enviar ${line.text}`}
          value={!line.excluded}
          onValueChange={on => onChange({ ...line, excluded: !on })}
          trackColor={{ true: colors.primary, false: colors.input }}
          thumbColor="#FFFFFF"
        />
      </View>

      {!line.excluded && (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Corregir cantidad y precios" onPress={() => setEditing(e => !e)} style={styles.math}>
            <Text style={styles.mathText}>
              {qty ? `${formatQty(qty.value)}${weighed ? ` ${qty.unit}` : ""}` : "?"} × {line.unitPrice === null ? "?" : cop(line.unitPrice)}
            </Text>
            <Text style={styles.mathTotal}>{line.total === null ? "?" : cop(line.total)}</Text>
            <Pencil size={13} color={colors.mutedForeground} />
          </Pressable>

          {editing && (
            <View style={styles.fields}>
              <Field
                label={weighed ? `Cantidad (${qty!.unit})` : "Cantidad"}
                value={qty ? formatQty(qty.value) : ""}
                decimal
                onChange={v => onChange({ ...line, edited: true, quantity: v === null ? null : { value: v, unit: qty?.unit ?? "unit" } })}
              />
              <Field label={weighed ? "Precio por kg" : "Precio unitario"} value={line.unitPrice?.toString() ?? ""} onChange={v => onChange({ ...line, edited: true, unitPrice: v })} />
              <Field label="Total" value={line.total?.toString() ?? ""} onChange={v => onChange({ ...line, edited: true, total: v })} />
            </View>
          )}

          <View style={styles.statusRow}>
            {check === "ok" ? (
              <View style={[styles.status, counts ? styles.statusOk : styles.statusIdle]}>
                <Check size={12} color={counts ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.statusText, counts ? styles.statusTextOk : styles.statusTextIdle]}>
                  {counts ? "Suma puntos" : "Sin producto: no se guarda"}
                </Text>
              </View>
            ) : (
              <View style={[styles.status, styles.statusWarn]}>
                <AlertTriangle size={12} color={colors.warnInk} />
                <Text style={[styles.statusText, styles.statusTextWarn]}>{ISSUE[check]}</Text>
              </View>
            )}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel={line.match && !line.noMatch ? `Producto: ${line.match.name}. Cambiar producto` : "Elegir producto"} onPress={onPickProduct} style={({ pressed }) => [styles.match, pressed && styles.pressed]}>
            {line.match && !line.noMatch ? (
              <>
                {line.match.image
                  ? <Image source={{ uri: line.match.image }} style={styles.thumb} />
                  : <View style={[styles.thumb, styles.thumbEmpty]} />}
                <View style={styles.matchBody}>
                  <Text numberOfLines={1} style={styles.matchName}>{line.match.name}</Text>
                  <Text style={styles.matchMeta}>{[line.match.size, line.match.by === "user" ? "elegido por ti" : null].filter(Boolean).join(" · ") || " "}</Text>
                </View>
                <Text style={styles.change}>Cambiar producto</Text>
              </>
            ) : (
              <>
                <View style={[styles.thumb, styles.thumbEmpty]} />
                <Text style={[styles.matchName, styles.matchBody]}>{line.noMatch ? "No está en la lista" : "Elige el producto"}</Text>
                <ChevronRight size={15} color={colors.primary} />
              </>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

function Field({ label, value, decimal, onChange }: { label: string; value: string; decimal?: boolean; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={t => { setText(t); onChange(readNumber(t, decimal)); }}
        inputMode={decimal ? "decimal" : "numeric"}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        maxLength={10}
        style={styles.input}
      />
    </View>
  );
}

/** "5.000" → 5000 for pesos; "0,845" → 0.845 for a weight. Empty → null. */
function readNumber(text: string, decimal?: boolean): number | null {
  const clean = decimal ? text.replace(",", ".").replace(/[^\d.]/g, "") : text.replace(/\D/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? (decimal ? n : Math.round(n)) : null;
}

const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(".", ","));

const styles = StyleSheet.create({
  row: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowIssue: { borderColor: colors.accent, backgroundColor: colors.warnBg },
  off: { opacity: 0.55 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  text: { flex: 1, fontSize: fontSize.subhead, fontWeight: "700", letterSpacing: 0.2, color: colors.receiptInk },
  math: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 32 },
  mathText: { flex: 1, fontSize: fontSize.body, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  mathTotal: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  fields: { flexDirection: "row", gap: spacing.sm },
  field: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: fontSize.small, fontWeight: "700", color: colors.mutedForeground },
  input: {
    height: 40, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.input,
    backgroundColor: colors.card, fontSize: fontSize.subhead, color: colors.foreground, fontVariant: ["tabular-nums"],
    ...(Platform.OS === "web" && { minWidth: 0 }),
  },
  statusRow: { flexDirection: "row" },
  status: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusOk: { backgroundColor: colors.secondary },
  statusIdle: { backgroundColor: colors.muted },
  statusWarn: { backgroundColor: colors.warnSurface },
  statusText: { fontSize: fontSize.caption, fontWeight: "700" },
  statusTextOk: { color: colors.primary },
  statusTextIdle: { color: colors.mutedForeground },
  statusTextWarn: { color: colors.warnInk },
  match: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.muted },
  pressed: { opacity: 0.7 },
  thumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.imageBg },
  thumbEmpty: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.input, backgroundColor: "transparent" },
  matchBody: { flex: 1, minWidth: 0 },
  matchName: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  matchMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
  change: { fontSize: fontSize.caption, fontWeight: "800", color: colors.primary },
  discount: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.muted, borderColor: colors.muted },
  discountText: { flex: 1, fontSize: fontSize.body, color: colors.mutedForeground },
  discountTotal: { fontSize: fontSize.body, fontWeight: "700", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
});
