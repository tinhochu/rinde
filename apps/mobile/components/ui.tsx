import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronDown, Minus, Plus } from "lucide-react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export function Button({
  title, onPress, variant = "primary", disabled, loading, icon,
}: {
  title: string; onPress: () => void; variant?: "primary" | "outline" | "white";
  disabled?: boolean; loading?: boolean; icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "outline" && styles.buttonOutline,
        variant === "white" && styles.buttonWhite,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#FFFFFF" : colors.primary} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonText,
              variant === "primary" ? styles.buttonTextPrimary : styles.buttonTextDark,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ selected, onPress, children }: { selected?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{children}</Text>
      {selected && <Check size={12} color={colors.primary} />}
    </Pressable>
  );
}

export function Stepper({ value, onMinus, onPlus, min = 1, max = 99, minusLabel, plusLabel }: {
  value: number; onMinus: () => void; onPlus: () => void; min?: number; max?: number;
  minusLabel?: string; plusLabel?: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel={minusLabel}
        disabled={value <= min}
        onPress={onMinus}
        style={[styles.stepperButton, value <= min && styles.stepperDisabled]}
      >
        <Minus size={15} color={colors.primary} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityLabel={plusLabel}
        disabled={value >= max}
        onPress={onPlus}
        style={[styles.stepperButton, value >= max && styles.stepperDisabled]}
      >
        <Plus size={15} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(previous => !previous)} style={styles.accordionHeader}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <ChevronDown size={14} color={colors.mutedForeground} style={open ? { transform: [{ rotate: "180deg" }] } : undefined} />
      </Pressable>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

// Bottom sheet presentation for cart-adjacent flows; centered dialog for details.
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetDismiss} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function Dialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <Pressable style={styles.dialogDismiss} onPress={onClose} />
        <SafeAreaView style={styles.dialogCard}>
          <ScrollView contentContainerStyle={styles.dialogScroll} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export const labelStyle: TextStyle = {
  fontSize: fontSize.caption,
  fontWeight: "600",
  color: colors.mutedForeground,
};

export const inputStyle: ViewStyle = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
  fontSize: fontSize.subhead,
  color: colors.foreground,
} as ViewStyle;

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderCurve: "continuous",
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonWhite: { backgroundColor: colors.card },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontSize: fontSize.subhead, fontWeight: "700" },
  buttonTextPrimary: { color: "#FFFFFF" },
  buttonTextDark: { color: colors.primary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  chipText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  chipTextSelected: { color: colors.primary },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 4,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDisabled: { opacity: 0.3 },
  stepperValue: { minWidth: 12, textAlign: "center", fontSize: fontSize.subhead, fontWeight: "700" },
  accordionHeader: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: spacing.sm },
  accordionTitle: { fontSize: fontSize.small, fontWeight: "600", color: colors.primary, flex: 1 },
  accordionBody: { paddingBottom: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheetDismiss: { flex: 1 },
  sheetCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "92%", maxWidth: 560, width: "100%", alignSelf: "center" },
  sheetGrabber: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginTop: spacing.sm,
  },
  dialogBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  dialogDismiss: { ...StyleSheet.absoluteFill },
  dialogCard: { backgroundColor: colors.card, borderRadius: radius.xl, maxHeight: "88%", maxWidth: 560, width: "100%", alignSelf: "center" },
  dialogScroll: { padding: spacing.xl, gap: spacing.md },
});
