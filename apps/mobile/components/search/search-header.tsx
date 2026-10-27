import { useRef, type ComponentRef, type Ref } from "react";
import { Animated, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { ArrowLeft, Search, X } from "lucide-react-native";
import { useReducedMotion } from "@/components/motion";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export type SearchInput = ComponentRef<typeof TextInput>;

/** The results screen's only chrome: Back within thumb reach, the query, and clear. */
export function SearchHeader({ inputRef, value, autoFocus, onChange, onSubmit, onClear, onBack, onFocusChange }: {
  inputRef?: Ref<SearchInput>; value: string; autoFocus?: boolean;
  onChange: (text: string) => void; onSubmit: () => void; onClear: () => void; onBack: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const focus = useRef(new Animated.Value(autoFocus ? 1 : 0)).current;
  function animate(next: boolean) {
    onFocusChange(next);
    if (reduced) focus.setValue(next ? 1 : 0);
    else Animated.timing(focus, { toValue: next ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });

  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <ArrowLeft size={22} color={colors.foreground} />
      </Pressable>
      <Animated.View style={[styles.field, { borderColor }]}>
        <Search size={18} color={colors.primary} />
        <TextInput
          ref={inputRef}
          accessibilityLabel="Buscar y comparar productos"
          value={value}
          onChangeText={onChange}
          onFocus={() => animate(true)}
          onBlur={() => animate(false)}
          autoFocus={autoFocus}
          maxLength={100}
          placeholder="Busca leche, arroz, huevos..."
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          enterKeyHint="search"
          autoCorrect={false}
          onSubmitEditing={onSubmit}
          style={styles.input}
        />
        {!!value && (
          <Pressable accessibilityLabel="Borrar búsqueda" onPress={onClear} hitSlop={10} style={styles.clear}>
            <X size={15} color={colors.foreground} />
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: colors.muted },
  field: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, paddingLeft: spacing.md, paddingRight: 6,
    borderRadius: radius.pill, borderWidth: 1.5, backgroundColor: colors.card,
  },
  // The field's own border shows focus; the browser's outline would draw a second box inside it.
  input: { flex: 1, minWidth: 0, height: "100%", fontSize: fontSize.title - 1, color: colors.foreground, ...(Platform.OS === "web" && { outlineStyle: "none" as never }) },
  clear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
});
