import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ShieldCheck, X } from "lucide-react-native";
import { PasswordMeter, passwordStrength } from "@/components/auth/password-meter";
import { Button, inputStyle, labelStyle } from "@/components/ui";
import { authClient, authErrorMessage, useAccount } from "@/lib/auth";
import { useCaptcha } from "@/lib/captcha";
import { toast } from "@/lib/toast";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * Where the person is in signing in:
 * - email: one field; a code by email is the main way in (it also creates the account), Google and a password are alternatives
 * - code: the six digits we sent
 * - password: the classic form, to create an account or enter with one
 * - reset / newPassword: "¿Olvidaste tu contraseña?", by a code to the same email
 */
type Step = "email" | "code" | "password" | "reset" | "newPassword";
type Mode = "signIn" | "signUp";

const RESEND_SECONDS = 60;
const cleanEmail = (s: string) => s.trim().toLowerCase();
const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Optional account: keeps receipts and points across devices. Rinde works fully without it. */
export default function AccountScreen() {
  const { methods, methodsReady } = useAccount();
  const [step, setStep] = useState<Step>("email");
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "verify" | "password" | "google">("");
  const [cooldown, setCooldown] = useState(0);
  // A proof of work solved in the background; each request that sends a code or tries a password takes one.
  const takeCaptcha = useCaptcha(methodsReady && methods.captcha);

  // Without email delivery there are no codes: the password form is the only email way in.
  useEffect(() => { if (methodsReady && !methods.code && step === "email") setStep("password"); }, [methodsReady, methods.code, step]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function go(next: Step) {
    setError("");
    setCode("");
    setStep(next);
  }

  /** The captcha header for a protected request, or null (with a message) when it couldn't be solved. */
  async function captchaHeaders() {
    try {
      return await takeCaptcha();
    } catch {
      setError("No pudimos comprobar que no eres un robot. Revisa tu conexión e inténtalo de nuevo.");
      return null;
    }
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }

  function back() {
    if (step === "code" || (step === "password" && methods.code)) go("email");
    else if (step === "reset") go("password");
    else if (step === "newPassword") go("reset");
    else close();
  }

  /** Sends a code for signing in or for a password reset, and moves to the step that takes it. */
  async function sendCode(purpose: "sign-in" | "forget-password") {
    setError("");
    const address = cleanEmail(email);
    if (!validEmail(address)) return setError("Escribe tu correo completo, por ejemplo ana@correo.com.");
    setBusy("send");
    const fetchOptions = await captchaHeaders();
    if (fetchOptions === null) return setBusy("");
    const { error: failed } = purpose === "sign-in"
      ? await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in", fetchOptions })
      : await authClient.emailOtp.requestPasswordReset({ email: address, fetchOptions });
    setBusy("");
    if (failed) return setError(authErrorMessage(failed));
    setEmail(address);
    setCooldown(RESEND_SECONDS);
    if (step !== "code" && step !== "newPassword") go(purpose === "sign-in" ? "code" : "newPassword");
    else toast.success("Te enviamos un código nuevo.");
  }

  // Takes the code directly when called on the sixth digit, before the state update lands.
  async function verifyCode(otp = code) {
    setError("");
    if (!/^\d{6}$/.test(otp)) return setError("El código tiene 6 números.");
    setBusy("verify");
    // The name only applies when this email has no account yet: signing in with a code also creates it.
    const { error: failed } = await authClient.signIn.emailOtp({ email, otp, name: name.trim() || email.split("@")[0]! });
    setBusy("");
    if (failed) return setError(authErrorMessage(failed));
    toast.success("Entraste a tu cuenta. Tus puntos quedan guardados.");
    close();
  }

  async function submitPassword() {
    setError("");
    const address = cleanEmail(email);
    if (!validEmail(address)) return setError("Escribe tu correo completo, por ejemplo ana@correo.com.");
    if (password.length < 8) return setError("La contraseña necesita al menos 8 caracteres.");
    if (mode === "signUp" && passwordStrength(password, address).score < 2) return setError("Esa contraseña es fácil de adivinar. Elige una más segura.");
    setBusy("password");
    const fetchOptions = await captchaHeaders();
    if (fetchOptions === null) return setBusy("");
    const { error: failed } = mode === "signUp"
      ? await authClient.signUp.email({ email: address, password, name: name.trim() || address.split("@")[0]!, fetchOptions })
      : await authClient.signIn.email({ email: address, password, fetchOptions });
    setBusy("");
    if (failed) return setError(authErrorMessage(failed));
    toast.success(mode === "signUp" ? "Cuenta creada. Tus puntos ya quedan guardados." : "Entraste a tu cuenta.");
    close();
  }

  async function resetPassword() {
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("El código tiene 6 números.");
    if (password.length < 8) return setError("La nueva contraseña necesita al menos 8 caracteres.");
    if (passwordStrength(password, email).score < 2) return setError("Esa contraseña es fácil de adivinar. Elige una más segura.");
    setBusy("verify");
    const fetchOptions = await captchaHeaders();
    if (fetchOptions === null) return setBusy("");
    const { error: failed } = await authClient.emailOtp.resetPassword({ email, otp: code, password });
    if (failed) { setBusy(""); return setError(authErrorMessage(failed)); }
    // A reset doesn't open a session by itself; enter with the new password right away.
    const { error: signInFailed } = await authClient.signIn.email({ email, password, fetchOptions });
    setBusy("");
    toast.success("Listo. Cambiaste tu contraseña.");
    if (signInFailed) { setMode("signIn"); go("password"); return; }
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

  const working = busy !== "";
  const googleButton = methods.google ? (
    <>
      <Button title="Continuar con Google" variant="outline" loading={busy === "google"} disabled={working} onPress={google} />
      <Or />
    </>
  ) : null;
  const emailField = (onSubmit: () => void, autoFocus = false) => (
    <Field label="Correo">
      <TextInput
        value={email}
        onChangeText={t => { setEmail(t); setError(""); }}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="tu@correo.com"
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        style={inputStyle}
      />
    </Field>
  );
  const errorText = error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}>
          {step !== "email" && !(step === "password" && !methods.code) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} style={styles.iconButton}>
              <ArrowLeft size={20} color={colors.foreground} />
            </Pressable>
          ) : <View />}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={styles.iconButton}>
            <X size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {!methodsReady && <ActivityIndicator color={colors.primary} style={styles.loading} />}
          {methodsReady && step === "email" && (
            <>
              <Title text="Entra o crea tu cuenta" lede="Te enviamos un código a tu correo: sin contraseñas que recordar. Es opcional; Rinde funciona igual sin cuenta." />
              {googleButton}
              <View style={styles.form}>
                {emailField(() => sendCode("sign-in"), !methods.google)}
                {errorText}
                <Button title="Enviarme un código" loading={busy === "send"} disabled={working} onPress={() => sendCode("sign-in")} />
              </View>
              <LinkButton text="Prefiero usar contraseña" onPress={() => { setMode("signIn"); go("password"); }} />
            </>
          )}

          {step === "code" && (
            <>
              <Title text="Revisa tu correo" lede={`Escribe el código de 6 números que enviamos a ${email}. Vence en 10 minutos.`} />
              <View style={styles.form}>
                <CodeInput value={code} onChange={c => { setCode(c); setError(""); }} onDone={verifyCode} />
                <Field label="Tu nombre (opcional, si es tu primera vez)">
                  <TextInput value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Cómo te saludamos" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
                </Field>
                {errorText}
                <Button title="Entrar" loading={busy === "verify"} disabled={working} onPress={() => verifyCode()} />
              </View>
              <Resend cooldown={cooldown} busy={busy === "send"} onPress={() => sendCode("sign-in")} />
              <Text style={styles.hint}>¿No te llega? Revisa spam o promociones, o cambia el correo.</Text>
              <LinkButton text="Cambiar correo" onPress={() => go("email")} />
            </>
          )}

          {step === "password" && (
            <>
              <Title text={mode === "signUp" ? "Crea tu cuenta" : "Entra con tu contraseña"} lede="Guarda tus puntos y tus facturas para verlos en tu celular y en la web. Es opcional: Rinde funciona igual sin cuenta." />
              <View style={styles.tabs} accessibilityRole="tablist">
                {(["signIn", "signUp"] as const).map(m => (
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
              {!methods.code ? googleButton : null}
              <View style={styles.form}>
                {mode === "signUp" && (
                  <Field label="Tu nombre (opcional)">
                    <TextInput value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Cómo te saludamos" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
                  </Field>
                )}
                {emailField(submitPassword)}
                <Field label="Contraseña">
                  <TextInput
                    value={password}
                    onChangeText={t => { setPassword(t); setError(""); }}
                    secureTextEntry
                    autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                    textContentType={mode === "signUp" ? "newPassword" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="go"
                    onSubmitEditing={submitPassword}
                    style={inputStyle}
                  />
                </Field>
                {mode === "signUp" ? <PasswordMeter password={password} email={email} /> : null}
                {errorText}
                <Button title={mode === "signUp" ? "Crear cuenta" : "Entrar"} loading={busy === "password"} disabled={working} onPress={submitPassword} />
              </View>
              {mode === "signIn" && methods.code ? <LinkButton text="¿Olvidaste tu contraseña?" onPress={() => go("reset")} /> : null}
              {methods.code ? <LinkButton text="Entrar con un código por correo" onPress={() => go("email")} /> : null}
            </>
          )}

          {step === "reset" && (
            <>
              <Title text="Recupera tu contraseña" lede="Escribe el correo de tu cuenta. Si existe, te enviamos un código para crear una contraseña nueva." />
              <View style={styles.form}>
                {emailField(() => sendCode("forget-password"), true)}
                {errorText}
                <Button title="Enviarme un código" loading={busy === "send"} disabled={working} onPress={() => sendCode("forget-password")} />
              </View>
            </>
          )}

          {step === "newPassword" && (
            <>
              <Title text="Crea una contraseña nueva" lede={`Si ${email} tiene una cuenta, le enviamos un código de 6 números. Vence en 10 minutos.`} />
              <View style={styles.form}>
                <CodeInput value={code} onChange={c => { setCode(c); setError(""); }} onDone={() => undefined} />
                <Field label="Contraseña nueva">
                  <TextInput
                    value={password}
                    onChangeText={t => { setPassword(t); setError(""); }}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="go"
                    onSubmitEditing={resetPassword}
                    style={inputStyle}
                  />
                </Field>
                <PasswordMeter password={password} email={email} />
                {errorText}
                <Button title="Guardar y entrar" loading={busy === "verify"} disabled={working} onPress={resetPassword} />
              </View>
              <Resend cooldown={cooldown} busy={busy === "send"} onPress={() => sendCode("forget-password")} />
            </>
          )}

          <View style={styles.assure}>
            <ShieldCheck size={13} color={colors.mutedForeground} />
            <Text style={styles.assureText}>Si ya ganaste puntos en este dispositivo, pasan a tu cuenta.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Title({ text, lede }: { text: string; lede: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>{text}</Text>
      <Text style={styles.lede}>{lede}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={labelStyle}>{label}</Text>
      {children}
    </View>
  );
}

function Or() {
  return (
    <View style={styles.or}>
      <View style={styles.rule} />
      <Text style={styles.orText}>o con tu correo</Text>
      <View style={styles.rule} />
    </View>
  );
}

function LinkButton({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text style={styles.linkText}>{text}</Text>
    </Pressable>
  );
}

function Resend({ cooldown, busy, onPress }: { cooldown: number; busy: boolean; onPress: () => void }) {
  return cooldown > 0 ? (
    <Text accessibilityLiveRegion="polite" style={styles.hint}>Puedes pedir otro código en {cooldown} s.</Text>
  ) : (
    <LinkButton text={busy ? "Enviando…" : "Reenviar código"} onPress={onPress} />
  );
}

/** Six digits in one field (so paste and SMS/email autofill work), drawn as six boxes. */
function CodeInput({ value, onChange, onDone }: { value: string; onChange: (code: string) => void; onDone: (code: string) => void }) {
  const input = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable accessibilityLabel={`Código de 6 números. Llevas ${value.length}.`} onPress={() => input.current?.focus()} style={styles.codeWrap}>
      <TextInput
        ref={input}
        value={value}
        onChangeText={t => {
          const digits = t.replace(/\D/g, "").slice(0, 6);
          onChange(digits);
          if (digits.length === 6) onDone(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        caretHidden
        style={styles.codeHidden}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.codeBox, focused && i === Math.min(value.length, 5) && styles.codeBoxActive]}>
          <Text style={styles.codeDigit}>{value[i] ?? ""}</Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  page: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  loading: { marginTop: spacing.xxl },
  titleBlock: { gap: spacing.sm },
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
  link: { alignSelf: "center", minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm },
  linkText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  pressed: { opacity: 0.6 },
  hint: { textAlign: "center", fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  codeWrap: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  codeHidden: { position: "absolute", width: "100%", height: "100%", opacity: 0, color: "transparent" },
  codeBox: {
    flex: 1, aspectRatio: 0.85, maxHeight: 64, alignItems: "center", justifyContent: "center",
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
  },
  codeBoxActive: { borderColor: colors.primary },
  codeDigit: { fontSize: 26, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
  assure: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  assureText: { fontSize: fontSize.small, color: colors.mutedForeground },
});
