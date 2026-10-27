import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { AlertCircle, CheckCircle2, ChevronDown, Trash2 } from "lucide-react-native";
import { animateNextLayout, FadeIn } from "@/components/motion";
import { inputStyle } from "@/components/ui";
import { cop, quantityLabel, type ListItem, type Unit } from "@/lib/market";
import { STORE_NAME, statusKey, type ItemStatus } from "@/lib/planner";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

type Shown = "kg" | "g" | "L" | "ml" | "und";
const SHOWN: Shown[] = ["kg", "g", "L", "ml", "und"];
const toShown = (quantity: number, unit: Unit): { amount: number; shown: Shown } =>
  unit === "g" && quantity >= 1000 ? { amount: quantity / 1000, shown: "kg" }
    : unit === "ml" && quantity >= 1000 ? { amount: quantity / 1000, shown: "L" }
      : { amount: quantity, shown: unit };
const toBase = (amount: number, shown: Shown): { quantity: number; unit: Unit } =>
  shown === "kg" ? { quantity: Math.round(amount * 1000), unit: "g" }
    : shown === "L" ? { quantity: Math.round(amount * 1000), unit: "ml" }
      : { quantity: amount, unit: shown };

/**
 * The shopping list as the planner sees it: one compact row per item, opened to edit amount, brand and
 * the two rules the optimizer follows. Price status comes only from the last real plan.
 */
export function ListEditor({ items, status, onChange }: {
  items: ListItem[]; status: Record<string, ItemStatus>; onChange: (items: ListItem[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (id: string, patch: Partial<ListItem>) => onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => {
    animateNextLayout();
    onChange(items.filter(i => i.id !== id));
  };
  return (
    <View style={styles.list}>
      {items.map(item => (
        <FadeIn key={item.id}>
          <Row
            item={item}
            status={status[statusKey(item.name)]}
            open={open === item.id}
            onToggle={() => { animateNextLayout(); setOpen(open === item.id ? null : item.id); }}
            onUpdate={patch => update(item.id, patch)}
            onRemove={() => remove(item.id)}
          />
        </FadeIn>
      ))}
    </View>
  );
}

function Row({ item, status, open, onToggle, onUpdate, onRemove }: {
  item: ListItem; status?: ItemStatus; open: boolean;
  onToggle: () => void; onUpdate: (patch: Partial<ListItem>) => void; onRemove: () => void;
}) {
  const { amount, shown } = toShown(item.quantity, item.unit);
  // The amount as typed, so "1," or an empty field survive until the person finishes.
  const [typed, setTyped] = useState(String(amount).replace(".", ","));
  const essential = item.essential ?? true;
  const rules = [item.brand ? (item.allowSubstitution ? `${item.brand} u otra equivalente` : `Solo ${item.brand}`) : "Cualquier marca", essential ? "imprescindible" : "opcional"];

  return (
    <View style={[styles.row, open && styles.rowOpen]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${item.name}, ${quantityLabel(item.quantity, item.unit)}. Editar`} onPress={onToggle} style={styles.headMain}>
          <View style={styles.headText}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
              <Text style={styles.qty}>{quantityLabel(item.quantity, item.unit)}</Text>
            </View>
            <Text numberOfLines={1} style={styles.rules}>{rules.join(" · ")}</Text>
            {status && <StatusLine status={status} />}
          </View>
          <ChevronDown size={16} color={colors.mutedForeground} style={open ? styles.chevronOpen : undefined} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} hitSlop={6} onPress={onRemove} style={styles.trash}>
          <Trash2 size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {open && (
        <View style={styles.body}>
          <Text style={styles.label}>Producto</Text>
          <TextInput
            accessibilityLabel="Producto"
            value={item.name}
            maxLength={100}
            onChangeText={name => onUpdate({ name })}
            style={inputStyle}
          />
          <Text style={styles.label}>Cantidad</Text>
          <View style={styles.qtyRow}>
            <TextInput
              accessibilityLabel="Cantidad"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={typed}
              onChangeText={text => {
                const clean = text.replace(/[^\d,.]/g, "").slice(0, 8);
                setTyped(clean);
                const n = Number(clean.replace(",", "."));
                if (n > 0) onUpdate(toBase(n, shown));
              }}
              style={[inputStyle, styles.qtyInput]}
            />
            <View style={styles.units}>
              {SHOWN.map(u => (
                <Pressable
                  key={u}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: u === shown }}
                  onPress={() => onUpdate(toBase(Number(typed.replace(",", ".")) || amount, u))}
                  style={[styles.unit, u === shown && styles.unitOn]}
                >
                  <Text style={[styles.unitText, u === shown && styles.unitTextOn]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={styles.label}>Marca preferida <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput accessibilityLabel="Marca preferida" value={item.brand} maxLength={80} placeholder="Cualquiera" placeholderTextColor={colors.mutedForeground} onChangeText={brand => onUpdate({ brand })} style={inputStyle} />
          <Toggle value={item.allowSubstitution} onChange={allowSubstitution => onUpdate({ allowSubstitution })} title="Acepto otra marca equivalente" text="Mismo producto; buscamos la que rinda más." />
          <Toggle value={essential} onChange={v => onUpdate({ essential: v })} title="Imprescindible" text="Si te pasas del presupuesto, nunca te propondremos quitarlo ni llevar menos." />
        </View>
      )}
    </View>
  );
}

function StatusLine({ status }: { status: ItemStatus }) {
  if (status.kind === "missing") {
    return (
      <View style={styles.status}>
        <AlertCircle size={12} color={colors.warnInk} />
        <Text style={[styles.statusText, styles.statusMissing]} numberOfLines={1}>Sin precio en tu último plan</Text>
      </View>
    );
  }
  return (
    <View style={styles.status}>
      <CheckCircle2 size={12} color={colors.primary} />
      <Text style={styles.statusText} numberOfLines={1}>
        {cop(status.lineTotal)} en {STORE_NAME[status.store]} · {status.live ? "verificado" : "precio de catálogo"} en tu último plan
      </Text>
    </View>
  );
}

function Toggle({ value, onChange, title, text }: { value: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSub}>{text}</Text>
      </View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} thumbColor={colors.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowOpen: { borderColor: colors.primary },
  head: { flexDirection: "row", alignItems: "center" },
  headMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingLeft: spacing.lg },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  name: { flexShrink: 1, fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  qty: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
  rules: { fontSize: fontSize.caption, color: colors.mutedForeground },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  trash: { padding: spacing.md },
  status: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusText: { flexShrink: 1, fontSize: fontSize.caption, color: colors.primary },
  statusMissing: { color: colors.warnInk },
  body: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  label: { fontSize: fontSize.caption, fontWeight: "700", color: colors.mutedForeground },
  optional: { fontWeight: "400" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyInput: { width: 76 },
  units: { flex: 1, flexDirection: "row", borderRadius: radius.md, backgroundColor: colors.muted, padding: 3 },
  unit: { flex: 1, alignItems: "center", borderRadius: radius.sm, paddingVertical: 8 },
  unitOn: { backgroundColor: colors.card },
  unitText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  unitTextOn: { color: colors.primary, fontWeight: "800" },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xs },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: fontSize.caption, fontWeight: "700", color: colors.foreground },
  toggleSub: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
});
