import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Pencil, UserRound } from "lucide-react-native";
import { router } from "expo-router";
import { Button, Dialog } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");

/**
 * Who is using Rinde. A guest sees what an account adds, in one line, and the way in; a signed-in
 * person sees their name and email and can change the name. Signing out lives in "Mi cuenta".
 */
export function ProfileAccountCard() {
  const { user, loading } = useAccount();
  const [editing, setEditing] = useState(false);

  if (!user) {
    return (
      <View style={styles.card}>
        <View style={styles.top}>
          <View style={styles.avatar}><UserRound size={22} color={colors.primary} /></View>
          <View style={styles.body}>
            <Text style={styles.title}>Estás explorando como invitado</Text>
            <Text style={styles.text}>Puedes comparar precios sin registrarte. Crea una cuenta para guardar tus puntos y facturas en todos tus dispositivos.</Text>
          </View>
        </View>
        <Button title="Crear cuenta o iniciar sesión" disabled={loading} onPress={() => router.push("/account")} />
      </View>
    );
  }

  const name = user.name?.trim() || "";
  return (
    <View style={[styles.card, styles.cardRow]}>
      <View style={[styles.avatar, styles.avatarFilled]}>
        {name ? <Text style={styles.initials}>{initials(name)}</Text> : <UserRound size={22} color={colors.primaryForeground} />}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>{name || "Tu cuenta"}</Text>
        {user.email ? <Text numberOfLines={1} style={styles.text}>{user.email}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Editar perfil" hitSlop={8} onPress={() => setEditing(true)} style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
        <Pencil size={14} color={colors.primary} />
        <Text style={styles.editText}>Editar</Text>
      </Pressable>
      <EditNameDialog visible={editing} name={name} onClose={() => setEditing(false)} />
    </View>
  );
}

function EditNameDialog({ visible, name, onClose }: { visible: boolean; name: string; onClose: () => void }) {
  const { rename } = useAccount();
  const [text, setText] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const next = text.trim();
    if (!next) { setError("Escribe un nombre."); return; }
    setSaving(true);
    setError("");
    try {
      await rename(next);
      toast.success("Listo. Guardamos tu nombre.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar tu nombre.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text style={styles.dialogTitle}>Editar perfil</Text>
      <Text style={styles.text}>Este nombre solo lo ves tú. En el ranking de tu zona apareces con el alias que eliges en Mis aportes.</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        maxLength={60}
        placeholder="Tu nombre"
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="done"
        onSubmitEditing={save}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.flex}><Button title="Cancelar" variant="outline" onPress={onClose} /></View>
        <View style={styles.flex}><Button title="Guardar" loading={saving} onPress={save} /></View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.secondary },
  cardRow: { flexDirection: "row", alignItems: "center" },
  top: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  avatarFilled: { backgroundColor: colors.primary },
  initials: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.primaryForeground },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  text: { fontSize: fontSize.caption, lineHeight: 18, color: colors.secondaryForeground },
  edit: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.card },
  editText: { fontSize: fontSize.caption, fontWeight: "700", color: colors.primary },
  pressed: { opacity: 0.7 },
  dialogTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  input: {
    height: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.input,
    fontSize: fontSize.subhead, color: colors.foreground, backgroundColor: colors.card,
    ...(Platform.OS === "web" && { outlineColor: colors.primary as never }),
  },
  error: { fontSize: fontSize.small, color: colors.destructive },
  actions: { flexDirection: "row", gap: spacing.sm },
});
