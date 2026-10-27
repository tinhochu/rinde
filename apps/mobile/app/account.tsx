import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShieldCheck, X } from "lucide-react-native";
import { Button, inputStyle, labelStyle } from "@/components/ui";
import { authClient, authErrorMessage, useAccount } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

type Mode = "signIn" | "signUp";

/** Optional account: keeps receipts and points across devices. Rinde works fully without it. */
export default function AccountScreen() {
  const { methods } = useAccount();
  const [mode, setMode] = useState<Mode>("signUp");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "email" | "google">("");

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }

  async function submit() {
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) return setError("Escribe tu correo.");
    if (password.length < 8) return setError("La contraseña necesita al menos 8 caracteres.");
    setBusy("email");
    const { error: failed } = mode === "signUp"
      ? await authClient.signUp.email({ email: cleanEmail, password, name: name.trim() || cleanEmail.split("@")[0]! })
      : await authClient.signIn.email({ email: cleanEmail, password });
    setBusy("");
    if (failed) return setError(authErrorMessage(failed));
    toast.success(mode === "signUp" ? "Cuenta creada. Tus puntos ya quedan guardados." : "Entraste a tu cuenta.");
    close();
  }

  async function google() {
    setError("");
    setBusy("google");
    // The web app leaves for Google and comes back to Perfil; the phone app opens a browser sheet and returns here.
    const callbackURL = Platform.OS === "web" ? `${window.location.origin}/profile` : "/profile";
    const { error: failed } = await authClient.signIn.social({ provider: "google", callbackURL });
    setBusy("");
    if (failed) return setError(authErrorMessage(failed));
    if (Platform.OS !== "web") close();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}>
          <Pressable accessibilityLabel="Cerrar" onPress={close} style={styles.close}>
            <X size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{mode === "signUp" ? "Crea tu cuenta" : "Entra a tu cuenta"}</Text>
          <Text style={styles.lede}>
            Guarda tus puntos y tus facturas para verlos en tu celular y en la web. Es opcional: Rinde funciona igual sin cuenta.
          </Text>

          <View style={styles.tabs} accessibilityRole="tablist">
            {(["signUp", "signIn"] as const).map(m => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => { setMode(m); setError(""); }}
                style={[styles.tab, mode === m && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{m === "signUp" ? "Crear cuenta" : "Ya tengo cuenta"}</Text>
              </Pressable>
            ))}
          </View>

          {methods.google && (
            <>
              <Button title="Continuar con Google" variant="outline" loading={busy === "google"} disabled={busy === "email"} onPress={google} />
              <View style={styles.or}>
                <View style={styles.rule} />
                <Text style={styles.orText}>o con tu correo</Text>
                <View style={styles.rule} />
              </View>
            </>
          )}

          <View style={styles.form}>
            {mode === "signUp" && (
              <View style={styles.field}>
                <Text style={labelStyle}>Tu nombre (opcional)</Text>
                <TextInput value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Cómo te saludamos" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
              </View>
            )}
            <View style={styles.field}>
              <Text style={labelStyle}>Correo</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="tu@correo.com"
                placeholderTextColor={colors.mutedForeground}
                style={inputStyle}
              />
            </View>
            <View style={styles.field}>
              <Text style={labelStyle}>Contraseña</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                textContentType={mode === "signUp" ? "newPassword" : "password"}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="go"
                onSubmitEditing={submit}
                style={inputStyle}
              />
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button title={mode === "signUp" ? "Crear cuenta" : "Entrar"} loading={busy === "email"} disabled={busy === "google"} onPress={submit} />
          </View>

          <View style={styles.assure}>
            <ShieldCheck size={13} color={colors.mutedForeground} />
            <Text style={styles.assureText}>Si ya ganaste puntos en este dispositivo, pasan a tu cuenta.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  page: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
  lede: { fontSize: fontSize.subhead, lineHeight: 22, color: colors.mutedForeground },
  tabs: { flexDirection: "row", padding: 4, borderRadius: radius.pill, backgroundColor: colors.muted },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: fontSize.caption, fontWeight: "600", color: colors.mutedForeground },
  tabTextActive: { color: colors.foreground, fontWeight: "800" },
  or: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: fontSize.small, color: colors.mutedForeground },
  form: { gap: spacing.md },
  field: { gap: 6 },
  error: { fontSize: fontSize.caption, lineHeight: 18, color: colors.destructive },
  assure: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  assureText: { fontSize: fontSize.small, color: colors.mutedForeground },
});
