import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { AnchorStep, type AnchorChoice } from "@/components/route/anchor-step";
import { RouteResult } from "@/components/route/route-result";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { loadTravel, saveTravel, streamRoutePlan, type RoutePlanEvent, type TravelPrefs } from "@/lib/route";
import { colors, fontSize, spacing } from "@/lib/theme";

type Events = {
  options: Extract<RoutePlanEvent, { type: "options" }> | null;
  advice: Extract<RoutePlanEvent, { type: "advice" }> | null;
  question: Extract<RoutePlanEvent, { type: "question" }> | null;
  verified: Extract<RoutePlanEvent, { type: "verified" }> | null;
};
const EMPTY: Events = { options: null, advice: null, question: null, verified: null };

/** "Planear mi ruta": pick the usual supermarket, then see whether one extra stop is worth it. */
export default function RoutePlanScreen() {
  const { result } = useAppState();
  const listId = result?.listId ?? null;
  const [travel, setTravel] = useState<TravelPrefs | null>(null);
  const [choice, setChoice] = useState<AnchorChoice | null>(null);
  const [events, setEvents] = useState<Events>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => { void loadTravel().then(setTravel); }, []);
  useEffect(() => () => request.current?.abort(), []);

  function updateTravel(next: TravelPrefs) {
    setTravel(next);
    void saveTravel(next);
  }

  function run(picked: AnchorChoice, answer?: string) {
    if (!listId || !travel) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setChoice(picked);
    setError(null);
    setLoading(true);
    // An answer keeps the routes on screen; only the advice is asked again.
    setEvents(e => (answer ? { ...e, advice: null, question: null, verified: null } : EMPTY));
    const { mode, busFare, motoPerKm, carPerKm, parking } = travel;
    streamRoutePlan(
        {
          listId,
          anchor: picked.anchor,
          start: picked.start ? { lat: picked.start[0], lon: picked.start[1] } : null,
          travel: { mode, busFare, motoPerKm, carPerKm, parking },
          note: picked.note,
          ...(answer ? { answer } : {}),
        },
        event => {
          if (controller.signal.aborted) return;
          if (event.type === "error") return;
          setEvents(e => ({ ...e, [event.type]: event }));
        },
        controller.signal,
      )
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos armar la ruta. Intenta de nuevo.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }

  function back() {
    if (choice) { request.current?.abort(); setChoice(null); setEvents(EMPTY); setError(null); setLoading(false); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ArrowLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.topTitle}>{choice ? choice.anchorLabel : "Planear mi ruta"}</Text>
        <View style={styles.back} />
      </View>

      {!listId ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Primero arma tu lista y compárala; luego te ayudamos a planear la ruta.</Text>
          <Button title="Ir a mi lista" onPress={() => router.replace("/")} />
        </View>
      ) : !travel ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !choice ? (
        <AnchorStep travel={travel} onTravel={updateTravel} onSubmit={c => run(c)} />
      ) : events.options ? (
        <RouteResult
          options={events.options}
          advice={events.advice}
          question={events.question}
          verified={events.verified}
          mode={travel.mode}
          start={choice.start}
          onAnswer={a => run(choice, a)}
          onEdit={back}
        />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error}</Text>
          <Button title="Intentar de nuevo" onPress={() => run(choice)} />
          <Button title="Cambiar tienda" variant="outline" onPress={back} />
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{loading ? "Trazando rutas por las calles y comparando tu lista…" : ""}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  topTitle: { flex: 1, textAlign: "center", fontSize: fontSize.subhead + 1, fontWeight: "700", color: colors.foreground },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  muted: { fontSize: fontSize.body, lineHeight: 20, textAlign: "center", color: colors.mutedForeground },
});
