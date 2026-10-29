import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Bookmark, CircleHelp, KeyRound, ListChecks, Lock, LogOut, Trash2 } from "lucide-react-native";
import { router } from "expo-router";
import { PasswordMeter, passwordStrength } from "@/components/auth/password-meter";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useAccount } from "@/lib/auth";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { PreferenceRow, Section } from "./rows";

const ICON = 17;

/** "Mis datos y ayuda": where saved things, help and privacy live. */
export function DataSection() {
  const { saved, cartCount, openModal } = useAppState();

  return (
    <Section title="Mis datos y ayuda">
      <PreferenceRow
        icon={<Bookmark size={ICON} color={colors.primary} />}
        label="Mis planes guardados"
        value={saved ? `${saved.items.length} productos` : "Ninguno"}
        onPress={() => openModal("saved")}
      />
      <PreferenceRow
        icon={<ListChecks size={ICON} color={colors.primary} />}
        label="Mi lista"
        value={cartCount ? `${cartCount} ${cartCount === 1 ? "producto" : "productos"}` : "Vacía"}
        onPress={() => router.navigate("/cart")}
      />
      <PreferenceRow icon={<CircleHelp size={ICON} color={colors.primary} />} label="Cómo funciona Rinde" onPress={() => openModal("help")} />
      <PreferenceRow icon={<Lock size={ICON} color={colors.primary} />} label="Privacidad y mis datos" onPress={() => openModal("privacy")} last />
    </Section>
  );
}

/**
 * "Mi cuenta", only when signed in: sign out, change the password (when the account has one), and delete
 * the account. Each opens in place on the profile; deleting asks again inside its row before it acts.
 */
export function AccountSection() {
  const { user, signOut, deleteAccount, hasPassword, changePassword } = useAccount();
  const [busy, setBusy] = useState<"out" | "delete" | "password" | null>(null);
  // Accounts made with a code or Google have no password, so there is none to change or ask for.
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<{ on: "out" | "password" | "delete"; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    hasPassword().then(has => live && setWithPassword(has)).catch(() => undefined);
    return () => { live = false; };
  }, [user?.id]);

  if (!user) return null;

  function clear() {
    setPassword("");
    setNext("");
    setError(null);
  }

  async function leave() {
    setBusy("out");
    try {
      await signOut();
      clear();
      toast.success("Cerraste sesión. Tus puntos siguen en tu cuenta.");
    } catch {
      setError({ on: "out", text: "No pudimos cerrar sesión. Inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    if (next.length < 8) return setError({ on: "password", text: "La nueva contraseña debe tener al menos 8 caracteres." });
    if (passwordStrength(next, user?.email).score < 2) return setError({ on: "password", text: "Esa contraseña es fácil de adivinar. Elige una más segura." });
    setBusy("password");
    setError(null);
    try {
      await changePassword(password, next);
      clear();
      toast.success("Cambiamos tu contraseña. Cerramos tu sesión en los demás dispositivos.");
    } catch (e) {
      setError({ on: "password", text: e instanceof Error ? e.message : "No pudimos cambiar tu contraseña." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await deleteAccount(withPassword ? password : undefined);
      clear();
      toast.success("Eliminamos tu cuenta. Puedes seguir usando Rinde como invitado.");
    } catch (e) {
      setError({ on: "delete", text: e instanceof Error ? e.message : "No pudimos eliminar tu cuenta." });
    } finally {
      setBusy(null);
    }
  }

  const passwordInput = (placeholder: string, value: string, onChange: (v: string) => void, autoComplete: "current-password" | "new-password") => (
    <TextInput
      value={value}
      onChangeText={onChange}
      secureTextEntry
      autoComplete={autoComplete}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      style={styles.input}
    />
  );
  const errorFor = (on: "out" | "password" | "delete") =>
    error?.on === on ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error.text}</Text> : null;

  return (
    <Section title="Mi cuenta" note={user.email ? `Entraste como ${user.email}.` : undefined}>
      <PreferenceRow
        icon={<LogOut size={ICON} color={colors.primary} />}
        label={busy === "out" ? "Cerrando sesión…" : "Cerrar sesión"}
        onPress={busy ? undefined : leave}
        below={errorFor("out") ?? undefined}
      />
      {withPassword ? (
        <PreferenceRow icon={<KeyRound size={ICON} color={colors.primary} />} label="Cambiar contraseña">
          {passwordInput("Contraseña actual", password, setPassword, "current-password")}
          {passwordInput("Nueva contraseña", next, setNext, "new-password")}
          <PasswordMeter password={next} email={user.email} />
          <Text style={styles.text}>Mínimo 8 caracteres. Al cambiarla cerramos tu sesión en los demás dispositivos.</Text>
          <Button title="Guardar contraseña" loading={busy === "password"} disabled={!password || !next} onPress={savePassword} />
          {errorFor("password")}
        </PreferenceRow>
      ) : null}
      <PreferenceRow icon={<Trash2 size={ICON} color={colors.destructive} />} label="Eliminar cuenta" last>
        <Text style={styles.text}>
          Borramos tu cuenta, tu correo y tu nombre. Las facturas y precios que ya aportaste se quedan sin tu nombre, como aportes anónimos, y tus puntos dejan de estar en tu cuenta.
        </Text>
        <Text style={styles.dangerTitle}>Esto no se puede deshacer.</Text>
        {withPassword ? (
          <>
            <Text style={styles.text}>Escribe tu contraseña para confirmar.</Text>
            {passwordInput("Contraseña", password, setPassword, "current-password")}
          </>
        ) : null}
        <Button title="Eliminar mi cuenta" variant="danger" loading={busy === "delete"} disabled={withPassword && !password} onPress={remove} />
        {errorFor("delete")}
      </PreferenceRow>
    </Section>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  dangerTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.destructive },
  input: {
    height: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.input,
    fontSize: fontSize.subhead, color: colors.foreground, backgroundColor: colors.card,
    ...(Platform.OS === "web" && { outlineColor: colors.primary as never }),
  },
  error: { fontSize: fontSize.small, color: colors.destructive },
});
