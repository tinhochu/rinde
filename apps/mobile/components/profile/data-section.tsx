import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Bookmark, CircleHelp, KeyRound, ListChecks, Lock, LogOut, UserCog } from "lucide-react-native";
import { router } from "expo-router";
import { Button, Dialog } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useAccount } from "@/lib/auth";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { PreferenceRow, Section } from "./rows";

const ICON = 17;

/** "Mis datos y ayuda": where saved things, help and privacy live, plus the account itself when signed in. */
export function DataSection() {
  const { saved, cartCount, openModal } = useAppState();
  const { user } = useAccount();
  const [managing, setManaging] = useState(false);

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
      <PreferenceRow icon={<Lock size={ICON} color={colors.primary} />} label="Privacidad y mis datos" onPress={() => openModal("privacy")} last={!user} />
      {user ? (
        <PreferenceRow icon={<UserCog size={ICON} color={colors.primary} />} label="Gestionar cuenta" onPress={() => setManaging(true)} last />
      ) : null}
      {user ? <ManageAccountDialog visible={managing} onClose={() => setManaging(false)} /> : null}
    </Section>
  );
}

/** Sign out, change the password (when the account has one), or delete the account after an explicit second step. */
function ManageAccountDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, signOut, deleteAccount, hasPassword, changePassword } = useAccount();
  const [busy, setBusy] = useState<"out" | "delete" | "password" | null>(null);
  const [mode, setMode] = useState<"menu" | "password" | "delete">("menu");
  // Accounts made with a code or Google have no password, so there is none to change or ask for.
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    let live = true;
    hasPassword().then(has => live && setWithPassword(has)).catch(() => undefined);
    return () => { live = false; };
  }, [visible]);

  function back() {
    setMode("menu");
    setPassword("");
    setNext("");
    setError("");
  }

  function close() {
    back();
    onClose();
  }

  async function leave() {
    setBusy("out");
    try {
      await signOut();
      toast.success("Cerraste sesión. Tus puntos siguen en tu cuenta.");
      close();
    } catch {
      setError("No pudimos cerrar sesión. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    if (next.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    setBusy("password");
    setError("");
    try {
      await changePassword(password, next);
      toast.success("Cambiamos tu contraseña. Cerramos tu sesión en los demás dispositivos.");
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cambiar tu contraseña.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError("");
    try {
      await deleteAccount(withPassword ? password : undefined);
      toast.success("Eliminamos tu cuenta. Puedes seguir usando Rinde como invitado.");
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminar tu cuenta.");
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

  return (
    <Dialog visible={visible} onClose={close}>
      <Text style={styles.title}>Gestionar cuenta</Text>
      {user?.email ? <Text style={styles.text}>Entraste como {user.email}.</Text> : null}
      {mode === "menu" ? (
        <>
          <Button title="Cerrar sesión" variant="outline" icon={<LogOut size={16} color={colors.primary} />} loading={busy === "out"} onPress={leave} />
          {withPassword ? (
            <Button title="Cambiar contraseña" variant="outline" icon={<KeyRound size={16} color={colors.primary} />} onPress={() => setMode("password")} />
          ) : null}
          <View style={styles.danger}>
            <Text style={styles.dangerTitle}>Eliminar cuenta</Text>
            <Text style={styles.text}>
              Borramos tu cuenta, tu correo y tu nombre. Las facturas y precios que ya aportaste se quedan sin tu nombre, como aportes anónimos, y tus puntos dejan de estar en tu cuenta.
            </Text>
            <Button title="Quiero eliminar mi cuenta" variant="outline" onPress={() => setMode("delete")} />
          </View>
        </>
      ) : mode === "password" ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Cambiar contraseña</Text>
          {passwordInput("Contraseña actual", password, setPassword, "current-password")}
          {passwordInput("Nueva contraseña", next, setNext, "new-password")}
          <Text style={styles.text}>Mínimo 8 caracteres. Al cambiarla cerramos tu sesión en los demás dispositivos.</Text>
          <View style={styles.actions}>
            <View style={styles.flex}><Button title="Cancelar" variant="outline" onPress={back} /></View>
            <View style={styles.flex}><Button title="Guardar" loading={busy === "password"} disabled={!password || !next} onPress={savePassword} /></View>
          </View>
        </View>
      ) : (
        <View style={styles.danger}>
          <Text style={styles.dangerTitle}>¿Seguro? Esto no se puede deshacer.</Text>
          {withPassword ? (
            <>
              <Text style={styles.text}>Escribe tu contraseña para confirmar.</Text>
              {passwordInput("Contraseña", password, setPassword, "current-password")}
            </>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.flex}><Button title="Cancelar" variant="outline" onPress={back} /></View>
            <View style={styles.flex}><Button title="Eliminar" variant="danger" loading={busy === "delete"} disabled={withPassword && !password} onPress={remove} /></View>
          </View>
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  text: { fontSize: fontSize.caption, lineHeight: 18, color: colors.mutedForeground },
  danger: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  boxTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  dangerTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.destructive },
  input: {
    height: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.input,
    fontSize: fontSize.subhead, color: colors.foreground, backgroundColor: colors.card,
    ...(Platform.OS === "web" && { outlineColor: colors.primary as never }),
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  error: { fontSize: fontSize.small, color: colors.destructive },
});
