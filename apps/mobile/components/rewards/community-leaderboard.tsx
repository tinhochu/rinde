import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Award, Pencil, ScanLine, Trophy } from "lucide-react-native";
import { Button } from "@/components/ui";
import { fetchLeaderboard, fetchRewards, saveDisplayName, type Leaderboard, type MyRewards, type RankRow } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

// Shown greyed out until earned, so people know what there is to get (mirrors BADGES in apps/web/src/server/rewards.ts).
const ALL_BADGES = [
  { id: "primera-factura", name: "Primera factura" },
  { id: "cazador-de-frutas", name: "Cazador de frutas" },
  { id: "pionero", name: "Pionero" },
  { id: "constante", name: "Constante" },
];

/**
 * Perfil → "Tus puntos": balance, badges, this week's ranking in the person's zone, and the name
 * shown there. Reloads whenever Perfil comes back into view, so a receipt just sent shows up.
 */
export function RewardsSection({ area }: { area: string }) {
  const [mine, setMine] = useState<MyRewards | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setFailed(false);
    fetchRewards(controller.signal)
      .then(async r => {
        setMine(r);
        // Before a first receipt the API has no zone for this device; Perfil's zone is where it will rank.
        setBoard(await fetchLeaderboard(r.zone || area, controller.signal));
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [area]));

  const scan = <Button title="Escanear factura" onPress={() => router.push("/receipt")} icon={<ScanLine size={16} color="#FFFFFF" />} />;

  if (!mine) {
    return (
      <View style={styles.card}>
        {failed
          ? <Text style={styles.muted}>No pudimos cargar tus puntos. Revisa tu conexión.</Text>
          : <ActivityIndicator color={colors.primary} />}
        {scan}
      </View>
    );
  }

  const earned = new Set(mine.badges.map(b => b.id));
  return (
    <View style={styles.card}>
      <View style={styles.balanceRow}>
        <View style={styles.balanceBody}>
          <Text style={styles.balance}>{mine.points.toLocaleString("es-CO")}</Text>
          <Text style={styles.balanceLabel}>{mine.points === 1 ? "punto" : "puntos"}</Text>
        </View>
        {mine.rank && (
          <View style={styles.rankPill}>
            <Trophy size={14} color={colors.accent} />
            <Text style={styles.rankText}>#{mine.rank.rank} esta semana</Text>
          </View>
        )}
      </View>
      <Text style={styles.muted}>
        {mine.points ? "Ganas 10 por cada precio aceptado, y 15 más si esa tienda no tenía precio para ese producto o si es fruta o verdura." : "Escanea una factura de D1, Jumbo o Éxito y gana 10 puntos por cada precio que confirmes."}
      </Text>

      {scan}

      <View style={styles.badges}>
        {ALL_BADGES.map(b => (
          <View key={b.id} accessibilityLabel={`${b.name}${earned.has(b.id) ? ", ganada" : ", por ganar"}`} style={[styles.badge, !earned.has(b.id) && styles.badgeLocked]}>
            <Award size={18} color={earned.has(b.id) ? colors.accent : colors.mutedForeground} />
            <Text numberOfLines={2} style={[styles.badgeName, !earned.has(b.id) && styles.badgeNameLocked]}>{b.name}</Text>
          </View>
        ))}
      </View>

      <NameEditor name={mine.name} onSaved={setMine} />

      {board && <Ranking board={board} />}

      <Text style={styles.fine}>Los puntos no tienen valor en dinero.</Text>
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
      <Text style={styles.rankingTitle}>Ranking de la semana · {board.zone.split(",")[0]}</Text>
      {board.top.length === 0 ? (
        <Text style={styles.muted}>Aún nadie ha enviado facturas esta semana en tu zona. Escanea la tuya y apareces aquí.</Text>
      ) : (
        <>
          {board.top.map(r => <RankLine key={`${r.rank}-${r.name}`} row={r} />)}
          {showYou && (
            <>
              <Text style={styles.gap}>···</Text>
              <RankLine row={board.you!} />
            </>
          )}
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
  muted: { fontSize: fontSize.body, lineHeight: 18, color: colors.mutedForeground },
  fine: { fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  balanceBody: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6 },
  balance: { fontSize: fontSize.hero, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] },
  balanceLabel: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  rankPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.warnSurface },
  rankText: { fontSize: fontSize.caption, fontWeight: "800", color: colors.warnInk },
  badges: { flexDirection: "row", gap: spacing.sm },
  badge: { flex: 1, alignItems: "center", gap: 4, paddingVertical: spacing.sm, paddingHorizontal: 4, borderRadius: radius.md, backgroundColor: colors.warnBg },
  badgeLocked: { backgroundColor: colors.muted },
  badgeName: { textAlign: "center", fontSize: fontSize.small, fontWeight: "700", color: colors.foreground },
  badgeNameLocked: { color: colors.mutedForeground },
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
