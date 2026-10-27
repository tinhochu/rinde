import { useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowRight, Search, X } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { useReducedMotion } from "@/components/motion";
import { STORES } from "@/lib/market";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** Terms people search most, offered while the field is empty. Words only: no prices until a search runs. */
const SUGGESTED = ["leche", "arroz", "huevos", "aceite", "café", "pollo", "papa"];

/**
 * The home screen's main action. Empty, it shows the three stores it compares; focused, its ring lights
 * up and common searches appear under it.
 */
export function SearchField({ value, onChange, onSubmit, onClear, onSuggest }: {
  value: string; onChange: (text: string) => void; onSubmit: () => void; onClear: () => void; onSuggest: (term: string) => void;
}) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFocus(next: boolean) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    // Keep the suggestions mounted for a moment after blur so a tap on one still lands.
    if (next) setFocused(true);
    else blurTimer.current = setTimeout(() => setFocused(false), 180);
    if (reduced) focus.setValue(next ? 1 : 0);
    else Animated.timing(focus, { toValue: next ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }

  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.field, { borderColor }]}>
        <Search size={20} color={colors.primary} />
        <TextInput
          accessibilityLabel="Buscar y comparar productos"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          maxLength={100}
          placeholder="Busca leche, arroz, huevos..."
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          style={styles.input}
        />
        {value ? (
          <>
            <Pressable accessibilityLabel="Limpiar búsqueda" onPress={onClear} hitSlop={8} style={styles.clear}>
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable accessibilityLabel="Comparar precios" onPress={onSubmit} style={styles.go}>
              <ArrowRight size={18} color="#FFFFFF" />
            </Pressable>
          </>
        ) : (
          // The stores every search is compared across.
          <View accessibilityLabel="Compara en Éxito, Jumbo y D1" style={styles.logos}>
            {STORES.map((s, i) => (
              <View key={s} style={[styles.logo, i > 0 && styles.logoOverlap]}>
                <StoreLogo store={s} small />
              </View>
            ))}
          </View>
        )}
      </Animated.View>
      {focused && !value && (
        <View style={styles.suggest}>
          {SUGGESTED.map(term => (
            <Pressable key={term} onPress={() => onSuggest(term)} style={({ pressed }) => [styles.suggestChip, pressed && styles.suggestPressed]}>
              <Search size={12} color={colors.mutedForeground} />
              <Text style={styles.suggestText}>{term}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 56, paddingLeft: spacing.lg, paddingRight: 8,
    borderRadius: radius.pill, borderWidth: 1.5, backgroundColor: colors.card,
    ...(Platform.OS === "web" ? { boxShadow: "0 2px 10px rgba(0,0,0,0.06)" } : { elevation: 1 }),
  },
  // The pill's own border shows focus; the browser's outline would draw a second box inside it.
  input: { flex: 1, minWidth: 0, height: "100%", fontSize: fontSize.title - 1, color: colors.foreground, ...(Platform.OS === "web" && { outlineStyle: "none" as never }) },
  clear: { padding: 4 },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  logos: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  logo: { borderRadius: 12, borderWidth: 2, borderColor: colors.card },
  logoOverlap: { marginLeft: -7 },
  suggest: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestChip: {
    flexDirection: "row", alignItems: "center", gap: 5, minHeight: 34, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.muted,
  },
  suggestPressed: { opacity: 0.6 },
  suggestText: { fontSize: fontSize.body, fontWeight: "600", color: colors.foreground },
});
