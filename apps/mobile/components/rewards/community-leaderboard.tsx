import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Pencil, Users } from "lucide-react-native";
import { Button } from "@/components/ui";
import { saveDisplayName, type Leaderboard, type MyRewards, type RankRow } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

/**
 * "Ranking de la semana" for the person's zone, and the alias it shows them under. With nobody on it
 * yet, an invitation instead of an empty table. Only aliases and points are public, never receipt data.
 */
export function CommunityLeaderboard({ mine, board, onSaved }: { mine: MyRewards; board: Leaderboard | null; onSaved: (r: MyRewards) => void }) {
  const empty = !board || board.top.length === 0;
  return (
    <View style={styles.card}>
      {empty ? (
        <View style={styles.invite}>
          <Users size={22} color={colors.primary} />
          <Text style={styles.inviteTitle}>Ayuda a iniciar la comunidad de tu zona.</Text>
          <Text style={styles.muted}>Comparte precios y ayuda a que más personas encuentren mejores opciones. Cuando haya aportes esta semana, aquí verás el ranking.</Text>
        </View>
      ) : (
        <Ranking board={board} />
      )}
      <NameEditor name={mine.name} onSaved={onSaved} />
    </View>
  );
}

function NameEditor({ name, onSaved }: { name: string; onSaved: (r: MyRewards) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  // Before a name is chosen the API shows "Vecino #ABC12" on the ranking.
  const custom = !!name && !name.startsWith("Vecino #");

  async function save() {
    setSaving(true);
    try {
      onSaved(await saveDisplayName(text.trim()));
      setEditing(false);
      toast.success(text.trim() ? "Listo. Así apareces en el ranking." : "Listo. Apareces como vecino anónimo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar el nombre.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Tu nombre en el ranking: ${name || "sin nombre"}. Cambiar`} onPress={() => { setText(custom ? name : ""); setEditing(true); }} style={styles.nameRow}>
        <Text style={styles.nameLabel}>Apareces como</Text>
        <Text numberOfLines={1} style={styles.nameValue}>{name || "Vecino anónimo"}</Text>
        <Pencil size={14} color={colors.primary} />
      </Pressable>
    );
  }
  return (
    <View style={styles.nameEdit}>
      <Text style={styles.nameLabel}>Tu nombre en el ranking</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        maxLength={24}
        placeholder="Ej. Ana de Laureles"
        placeholderTextColor={colors.mutedForeground}
        onSubmitEditing={save}
        returnKeyType="done"
        style={styles.input}
      />
      <Text style={styles.fine}>Lo ven tus vecinos. Déjalo vacío para aparecer como anónimo; no uses tu nombre completo.</Text>
      <View style={styles.nameActions}>
        <View style={styles.flex}><Button title="Cancelar" variant="outline" onPress={() => setEditing(false)} /></View>
        <View style={styles.flex}><Button title="Guardar" loading={saving} onPress={save} /></View>
      </View>
    </View>
  );
}

function Ranking({ board }: { board: Leaderboard }) {
  const showYou = board.you && !board.top.some(r => r.you);
  return (
    <View style={styles.ranking}>
      <Text style={styles.rankingTitle}>{board.zone.split(",")[0]} · semana del {new Date(board.weekStart).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</Text>
      <Text style={styles.fine}>Puntos de precios aceptados esta semana.</Text>
      {board.top.map(r => <RankLine key={`${r.rank}-${r.name}`} row={r} />)}
      {showYou && (
        <>
          <Text style={styles.gap}>···</Text>
          <RankLine row={board.you!} />
        </>
      )}
    </View>
  );
}

function RankLine({ row }: { row: RankRow }) {
  return (
    <View style={[styles.rankLine, row.you && styles.rankLineYou]}>
      <Text style={[styles.rankNumber, row.rank <= 3 && styles.rankTop]}>{row.rank}</Text>
      <Text numberOfLines={1} style={[styles.rankName, row.you && styles.rankNameYou]}>{row.name}{row.you ? " (tú)" : ""}</Text>
      <Text style={styles.rankPoints}>{row.points.toLocaleString("es-CO")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  invite: { alignItems: "flex-start", gap: spacing.xs },
  inviteTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground },
  muted: { fontSize: fontSize.body, lineHeight: 18, color: colors.mutedForeground },
  fine: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted },
  nameLabel: { fontSize: fontSize.body, color: colors.mutedForeground },
  nameValue: { flex: 1, fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  nameEdit: { gap: spacing.sm },
  nameActions: { flexDirection: "row", gap: spacing.sm },
  input: {
    height: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.input,
    fontSize: fontSize.subhead, color: colors.foreground, backgroundColor: colors.card,
    ...(Platform.OS === "web" && { outlineColor: colors.primary as never }),
  },
  ranking: { gap: 2, paddingTop: spacing.xs },
  rankingTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, marginBottom: spacing.xs },
  rankLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  rankLineYou: { backgroundColor: colors.secondary },
  rankNumber: { width: 22, textAlign: "right", fontSize: fontSize.body, fontWeight: "800", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  rankTop: { color: colors.accent },
  rankName: { flex: 1, fontSize: fontSize.body, color: colors.foreground },
  rankNameYou: { fontWeight: "800", color: colors.primary },
  rankPoints: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
  gap: { textAlign: "center", color: colors.mutedForeground },
});
