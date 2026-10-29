import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/lib/theme";

// The passwords people pick first; the server also refuses any password seen in a known breach.
const COMMON = ["12345678", "123456789", "1234567890", "password", "contraseña", "contrasena", "qwerty", "abc12345", "colombia", "rinde", "11111111", "iloveyou", "tequiero"];

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; hint: string };

/** 0 too short, 1 weak, 2 fair, 3 good, 4 strong: length counts most, then mixing kinds of characters. */
export function passwordStrength(password: string, email = ""): Strength {
  if (password.length < 8) return { score: 0, label: "Muy corta", hint: "Usa al menos 8 caracteres." };
  const lower = password.toLowerCase();
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  const repeated = /^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|abcdefghij)/.test(lower);
  if (COMMON.some(c => lower.includes(c)) || (name.length >= 4 && lower.includes(name)) || repeated) {
    return { score: 1, label: "Débil", hint: "Es fácil de adivinar. Evita palabras comunes, tu correo y secuencias." };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  const points = (password.length >= 12 ? 2 : password.length >= 10 ? 1 : 0) + (kinds >= 3 ? 2 : kinds === 2 ? 1 : 0);
  if (points >= 4) return { score: 4, label: "Fuerte", hint: "Muy bien." };
  if (points >= 3) return { score: 3, label: "Buena", hint: "Para hacerla fuerte, alárgala o agrega un símbolo." };
  if (points >= 1) return { score: 2, label: "Aceptable", hint: "Mejor con 12 o más caracteres, o mezclando letras, números y símbolos." };
  return { score: 1, label: "Débil", hint: "Usa 12 o más caracteres, o mezcla letras, números y símbolos." };
}

const TONE = [colors.destructive, colors.destructive, colors.warnInk, colors.primary, colors.primary];

/** Four bars and a word under a new password; nothing until the person starts typing. */
export function PasswordMeter({ password, email }: { password: string; email?: string }) {
  if (!password) return null;
  const s = passwordStrength(password, email);
  const tone = TONE[s.score];
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`Seguridad de la contraseña: ${s.label}. ${s.hint}`} style={styles.wrap}>
      <View style={styles.bars}>
        {[1, 2, 3, 4].map(i => <View key={i} style={[styles.bar, { backgroundColor: i <= s.score ? tone : colors.muted }]} />)}
      </View>
      <Text style={styles.text}><Text style={[styles.label, { color: tone }]}>{s.label}. </Text>{s.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  bars: { flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 5, borderRadius: 3 },
  text: { fontSize: fontSize.caption, lineHeight: 17, color: colors.mutedForeground },
  label: { fontWeight: "800" },
});
