import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { animateNextLayout } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** A titled group of rows on one card. */
export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/**
 * One setting: icon, label, current value. With `onPress` it navigates (chevron right); with
 * `children` it opens in place to edit (chevron down); `control` sits on the row, `below` under it.
 */
export function PreferenceRow({ icon, label, value, onPress, control, below, children, last, accessibilityHint }: {
  icon: ReactNode; label: string; value?: string; onPress?: () => void; control?: ReactNode;
  /** Always-visible control under the label, for options too wide to share the row */
  below?: ReactNode;
  children?: ReactNode; last?: boolean; accessibilityHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!children;
  // A long value ("$ 300.000 a la quincena") reads better under the label than squeezing it.
  const valueBelow = !!value && (!!control || value.length > 14);
  const toggle = () => { animateNextLayout(); setOpen(o => !o); };

  const head = (
    <>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {valueBelow ? <Text numberOfLines={1} style={control ? styles.subValue : styles.valueUnder}>{value}</Text> : null}
      </View>
      {control ?? (value && !valueBelow ? <Text numberOfLines={1} style={[styles.value, open && styles.valueOpen]}>{value}</Text> : null)}
      {expandable
        ? <ChevronDown size={16} color={colors.mutedForeground} style={open ? styles.flip : undefined} />
        : onPress ? <ChevronRight size={16} color={colors.mutedForeground} /> : null}
    </>
  );

  return (
    <View style={!last && styles.divider}>
      {expandable || onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}: ${value}` : label}
          accessibilityHint={accessibilityHint}
          accessibilityState={expandable ? { expanded: open } : undefined}
          onPress={expandable ? toggle : onPress}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          {head}
        </Pressable>
      ) : (
        <View style={styles.row}>{head}</View>
      )}
      {below ? <View style={styles.panel}>{below}</View> : null}
      {expandable && open ? <View style={styles.panel}>{children}</View> : null}
    </View>
  );
}

/** Two to four mutually exclusive options in one pill track. */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T | undefined; onChange: (next: T) => void; label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => { if (!on) { animateNextLayout(); onChange(o.id); } }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground, paddingHorizontal: 2 },
  note: { fontSize: fontSize.small, lineHeight: 17, color: colors.mutedForeground, paddingHorizontal: 2 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pressed: { backgroundColor: colors.muted },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondary },
  text: { flex: 1, minWidth: 0, gap: 1 },
  label: { fontSize: fontSize.subhead, fontWeight: "600", color: colors.foreground },
  subValue: { fontSize: fontSize.small, color: colors.mutedForeground },
  value: { flexShrink: 1, maxWidth: "52%", textAlign: "right", fontSize: fontSize.body, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
  valueOpen: { color: colors.foreground },
  valueUnder: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary, fontVariant: ["tabular-nums"] },
  flip: { transform: [{ rotate: "180deg" }] },
  panel: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  segmented: { flexDirection: "row", padding: 3, gap: 2, borderRadius: radius.pill, backgroundColor: colors.muted },
  segment: { flexGrow: 1, flexBasis: "auto", minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  segmentTextOn: { fontWeight: "800", color: colors.primary },
});
