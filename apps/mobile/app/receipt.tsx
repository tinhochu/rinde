import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { AlertTriangle, ArrowLeft, Camera, CalendarClock, FileImage, FlaskConical, Receipt, ScanLine, Store } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { ReceiptDone } from "@/components/receipt/done";
import { ReceiptReview } from "@/components/receipt/review";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { STORES } from "@/lib/market";
import { confirmReceipt, editsFor, fetchSamples, uploadReceipt, type ConfirmResult, type ReceiptDraft, type ReceiptPhoto, type ReviewLine } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

type Stage =
  | { kind: "start" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string }
  | { kind: "review"; draft: ReceiptDraft }
  | { kind: "done"; draft: ReceiptDraft; result: ConfirmResult };

const SAMPLE_NAME: Record<string, string> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito" };

/**
 * /receipt: photo → upload → review → points. The draft only lives on this screen; leaving it
 * discards the draft (the API drops unconfirmed drafts after 24 h).
 */
export default function ReceiptScreen() {
  const { area } = useAppState();
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  const [samples, setSamples] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    void fetchSamples().then(s => alive.current && setSamples(s));
    return () => { alive.current = false; };
  }, []);

  function back() {
    if (stage.kind === "review" || stage.kind === "error") return setStage({ kind: "start" });
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function upload(source: { photo: ReceiptPhoto } | { sample: string }) {
    setStage({ kind: "uploading", progress: 0 });
    try {
      const draft = await uploadReceipt(source, area, progress => alive.current && setStage(s => (s.kind === "uploading" ? { kind: "uploading", progress } : s)));
      if (alive.current) setStage({ kind: "review", draft });
    } catch (e) {
      if (alive.current) setStage({ kind: "error", message: e instanceof Error ? e.message : "No pudimos leer la factura." });
    }
  }

  // Called straight from the button press: mobile browsers only open the camera on a user gesture.
  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return toast.error("Necesitamos la cámara para leer la factura. Puedes elegir una foto de tu galería.");
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      await upload({ photo: { uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg", file: asset.file } });
    } catch {
      toast.error("No pudimos abrir la cámara ni la galería.");
    }
  }

  async function send(lines: ReviewLine[]) {
    if (stage.kind !== "review") return;
    setSending(true);
    try {
      const result = await confirmReceipt(stage.draft.id, editsFor(lines, stage.draft));
      if (alive.current) setStage({ kind: "done", draft: stage.draft, result });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos enviar la factura.");
    } finally {
      if (alive.current) setSending(false);
    }
  }

  const title = stage.kind === "review" ? "Revisar factura" : stage.kind === "done" ? "Factura enviada" : "Escanear factura";

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.topBar}>
        {stage.kind !== "done" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <ArrowLeft size={22} color={colors.foreground} />
          </Pressable>
        ) : <View style={styles.back} />}
        <Text style={styles.topTitle}>{title}</Text>
        <View style={styles.back} />
      </View>

      {stage.kind === "start" && <Start samples={samples} onCamera={() => pick(true)} onLibrary={() => pick(false)} onSample={s => upload({ sample: s })} />}
      {stage.kind === "uploading" && <Uploading progress={stage.progress} />}
      {stage.kind === "error" && <Failed message={stage.message} onRetry={() => setStage({ kind: "start" })} />}
      {stage.kind === "review" && <ReceiptReview draft={stage.draft} sending={sending} onRetake={() => setStage({ kind: "start" })} onSend={send} />}
      {stage.kind === "done" && (
        <ReceiptDone
          result={stage.result}
          store={stage.draft.store}
          onAnother={() => setStage({ kind: "start" })}
          onRewards={() => router.replace("/profile")}
          onHome={() => router.replace("/")}
        />
      )}
    </SafeAreaView>
  );
}

function Start({ samples, onCamera, onLibrary, onSample }: {
  samples: string[]; onCamera: () => void; onLibrary: () => void; onSample: (name: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Receipt size={30} color={colors.primary} /></View>
        <Text accessibilityRole="header" style={styles.headline}>Comparte los precios de tu factura</Text>
        <Text style={styles.lede}>
          Leemos cada producto y su precio. Tú revisas antes de enviar, y tus vecinos ven lo que pagaste en la tienda.
        </Text>
        <View style={styles.logos}>{STORES.map(s => <StoreLogo key={s} store={s} small />)}</View>
      </View>

      <View style={styles.actions}>
        <Button title="Tomar foto" onPress={onCamera} icon={<Camera size={17} color="#FFFFFF" />} />
        <Button title="Elegir de la galería" variant="outline" onPress={onLibrary} icon={<FileImage size={17} color={colors.primary} />} />
      </View>

      {samples.length > 0 && (
        <View style={styles.samples}>
          <View style={styles.sampleHead}>
            <FlaskConical size={15} color={colors.warnInk} />
            <Text style={styles.sampleTitle}>Probar con una factura de ejemplo</Text>
          </View>
          <Text style={styles.sampleText}>Facturas reales grabadas para la demostración. Su lectura ya está guardada; no se usa la IA.</Text>
          <View style={styles.sampleRow}>
            {samples.map(s => (
              <Pressable key={s} accessibilityRole="button" onPress={() => onSample(s)} style={({ pressed }) => [styles.sample, pressed && styles.pressed]}>
                <StoreLogo store={SAMPLE_NAME[s] ?? s} small />
                <Text style={styles.sampleName}>{SAMPLE_NAME[s] ?? s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.rules}>
        <Rule icon={<Store size={16} color={colors.primary} />} text="Facturas de D1, Jumbo o Éxito" />
        <Rule icon={<CalendarClock size={16} color={colors.primary} />} text="De los últimos 3 días, hasta 5 por día" />
        <Rule icon={<ScanLine size={16} color={colors.primary} />} text="Completa, con buena luz y el número de factura visible abajo" />
      </View>
      <Text style={styles.small}>
        Antes de guardar la foto quitamos tu cédula y los datos de tu tarjeta. Los puntos no tienen valor en dinero.
      </Text>
    </ScrollView>
  );
}

function Rule({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.rule}>
      {icon}
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function Uploading({ progress }: { progress: number }) {
  const reading = progress >= 1;
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.centerTitle}>{reading ? "Leyendo tu factura…" : "Subiendo la foto…"}</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((reading ? 1 : progress) * 100)}%` }]} /></View>
      <Text style={styles.centerText}>
        {reading ? "Buscamos cada producto en el catálogo de la tienda. Puede tardar unos segundos." : `${Math.round(progress * 100)} %`}
      </Text>
    </View>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <View style={styles.failIcon}><AlertTriangle size={26} color={colors.warnInk} /></View>
      <Text style={styles.centerTitle}>No pudimos usar esta factura</Text>
      <Text style={styles.centerText}>{message}</Text>
      <Button title="Tomar la foto de nuevo" onPress={onRetry} icon={<Camera size={16} color="#FFFFFF" />} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  topTitle: { flex: 1, textAlign: "center", fontSize: fontSize.subhead + 1, fontWeight: "700", color: colors.mutedForeground },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.md },
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  headline: { textAlign: "center", fontSize: fontSize.headline, fontWeight: "800", color: colors.foreground },
  lede: { textAlign: "center", fontSize: fontSize.body + 1, lineHeight: 20, color: colors.mutedForeground, maxWidth: 330 },
  logos: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  actions: { gap: spacing.sm },
  samples: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.photoFrame },
  sampleHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  sampleTitle: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.warnInk },
  sampleText: { fontSize: fontSize.caption, lineHeight: 16, color: colors.warnText },
  sampleRow: { flexDirection: "row", gap: spacing.sm },
  sample: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sampleName: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  rules: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rule: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ruleText: { flex: 1, fontSize: fontSize.body, lineHeight: 18, color: colors.foreground },
  small: { textAlign: "center", fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  centerTitle: { textAlign: "center", fontSize: fontSize.title + 1, fontWeight: "800", color: colors.foreground },
  centerText: { textAlign: "center", fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground, maxWidth: 320 },
  bar: { width: 220, height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },
  failIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.warnSurface, alignItems: "center", justifyContent: "center" },
});
