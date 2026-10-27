import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, CircleCheck, Copy, ScanLine, ShieldCheck, Trophy } from "lucide-react-native";
import { FadeIn } from "@/components/motion";
import { AchievementCard } from "@/components/rewards/achievement-card";
import { CommunityLeaderboard } from "@/components/rewards/community-leaderboard";
import { ReceiptHistory } from "@/components/rewards/receipt-history";
import { useRewards } from "@/components/rewards/use-rewards";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { fetchLeaderboard, type Leaderboard } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// Badges already celebrated on this device, so an unlock is shown once.
const SEEN = "rinde-seen-badges";

/** "Mis aportes": points, receipts and their status, achievements with their rules, and the zone's ranking. */
export default function ContributionsScreen() {
  const { area } = useAppState();
  const { mine, failed, setMine } = useRewards();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Before a first receipt the API has no zone for this device; Perfil's zone is where it will rank.
  const zone = mine?.zone || area;
  useFocusEffect(useCallback(() => {
    if (!zone) return;
    const controller = new AbortController();
    fetchLeaderboard(zone, controller.signal).then(setBoard).catch(() => undefined);
    return () => controller.abort();
  }, [zone]));

  const earnedKey = mine?.achievements.filter(a => a.earnedAt).map(a => a.id).join(",");
  useEffect(() => {
    if (earnedKey === undefined) return;
    const earned = earnedKey ? earnedKey.split(",") : [];
    AsyncStorage.getItem(SEEN)
      .then(raw => {
        const seen = new Set<string>(raw ? JSON.parse(raw) : []);
        setFresh(new Set(earned.filter(id => !seen.has(id))));
        return AsyncStorage.setItem(SEEN, JSON.stringify(earned));
      })
      .catch(() => undefined);
  }, [earnedKey]);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }

  const scan = <Button title="Escanear factura" onPress={() => router.push("/receipt")} icon={<ScanLine size={16} color="#FFFFFF" />} />;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ArrowLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.topTitle}>Mis aportes</Text>
        <View style={styles.back} />
      </View>

      {!mine ? (
        <View style={styles.center}>
          {failed ? <Text style={styles.muted}>No pudimos cargar tus aportes. Revisa tu conexión y vuelve a intentarlo.</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FadeIn style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.points}>{mine.points.toLocaleString("es-CO")}</Text>
                <Text style={styles.pointsLabel}>{mine.points === 1 ? "punto" : "puntos"}</Text>
              </View>
              {mine.rank ? (
                <View style={styles.rankPill}>
                  <Trophy size={14} color={colors.forestWarn} />
                  <Text style={styles.rankText}>#{mine.rank.rank} esta semana</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.stats}>
              <Stat value={mine.receipts.confirmed} label={mine.receipts.confirmed === 1 ? "factura aceptada" : "facturas aceptadas"} />
              <Stat value={mine.receipts.prices} label={mine.receipts.prices === 1 ? "precio aportado" : "precios aportados"} />
            </View>
            <Text style={styles.heroFine}>Los puntos no tienen valor en dinero.</Text>
          </FadeIn>

          {scan}

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Cómo ganas puntos</Text>
            <View style={styles.rules}>
              <Rule icon={<CircleCheck size={16} color={colors.primary} />} text="10 puntos por cada precio de tu factura que revisas, confirmas y pasa nuestras verificaciones." />
              <Rule icon={<Trophy size={16} color={colors.accent} />} text="15 más si esa tienda no tenía precio para ese producto, o si es una fruta o verdura." />
              <Rule icon={<Copy size={16} color={colors.mutedForeground} />} text="Una misma factura solo suma una vez. Si resulta repetida, la anulamos y descontamos sus puntos." />
              <Rule icon={<ShieldCheck size={16} color={colors.mutedForeground} />} text="En el ranking solo aparecen tu alias y tus puntos. Nunca publicamos tu factura, cómo pagaste ni tus datos personales." last />
            </View>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Logros</Text>
            <View style={styles.badges}>
              {[...mine.achievements].sort((a, b) => Number(!!b.earnedAt) - Number(!!a.earnedAt)).map(a => (
                <AchievementCard key={a.id} achievement={a} fresh={fresh.has(a.id)} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Mis facturas</Text>
            {mine.recentReceipts.length ? (
              <ReceiptHistory receipts={mine.recentReceipts} />
            ) : (
              <Text style={styles.muted}>Aún no has enviado facturas. Escanea una de D1, Jumbo o Éxito: antes de enviarla revisas cada producto y precio.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Ranking de la semana</Text>
            <CommunityLeaderboard mine={mine} board={board} onSaved={setMine} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString("es-CO")}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Rule({ icon, text, last }: { icon: ReactNode; text: string; last?: boolean }) {
  return (
    <View style={[styles.rule, !last && styles.ruleDivider]}>
      <View style={styles.ruleIcon}>{icon}</View>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  topTitle: { flex: 1, textAlign: "center", fontSize: fontSize.subhead + 1, fontWeight: "700", color: colors.foreground },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.forest },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  points: { fontSize: 44, fontWeight: "900", letterSpacing: -1.5, color: colors.forestInk, fontVariant: ["tabular-nums"] },
  pointsLabel: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.forestSub, marginTop: -4 },
  rankPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.forestLine },
  rankText: { fontSize: fontSize.caption, fontWeight: "800", color: colors.forestInk },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.forestLine },
  statValue: { fontSize: fontSize.title, fontWeight: "900", color: colors.forestInk, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: fontSize.small, color: colors.forestSub },
  heroFine: { fontSize: fontSize.small, color: colors.forestSub },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.title, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  rules: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rule: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  ruleDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  ruleIcon: { paddingTop: 1 },
  ruleText: { flex: 1, fontSize: fontSize.caption, lineHeight: 19, color: colors.foreground },
  badges: { gap: spacing.sm },
  muted: { fontSize: fontSize.body, lineHeight: 20, color: colors.mutedForeground, textAlign: "left" },
});
