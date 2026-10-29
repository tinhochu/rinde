import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { AlertTriangle, ArrowLeft, Camera, CalendarClock, FileImage, FlaskConical, Receipt, ScanLine, Store, X } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { ReceiptDone } from "@/components/receipt/done";
import { EmailInvoiceCard, PendingInvoices, RecentOutcomes } from "@/components/receipt/einvoice";
import { ReceiptReview } from "@/components/receipt/review";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useAccount } from "@/lib/auth";
import { STORES } from "@/lib/market";
import { copyText } from "@/lib/clipboard";
import {
  confirmReceipt, editsFor, fetchDraft, fetchInbox, fetchSamples, INVOICE_TYPE_MESSAGE, MAX_INVOICE_BYTES, MAX_PARTS, replaceAddress,
  uploadEInvoice, uploadReceipt, type ConfirmResult, type Inbox, type InvoiceFile, type ReceiptDraft, type ReceiptPhoto, type ReviewLine,
} from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { toast } from "@/lib/toast";

type Stage =
  | { kind: "start" }
  | { kind: "parts"; photos: ReceiptPhoto[] }
  | { kind: "uploading"; progress: number; parts: number; einvoice?: boolean }
  | { kind: "opening" }
  | { kind: "error"; message: string; einvoice?: boolean }
  | { kind: "review"; draft: ReceiptDraft }
  | { kind: "done"; draft: ReceiptDraft; result: ConfirmResult };

const SAMPLE_NAME: Record<string, string> = { d1: "D1", jumbo: "Jumbo", exito: "Éxito", carulla: "Carulla" };

// What the e-invoice picker offers: extensions in the browser's file dialog, MIME types on the phone.
const INVOICE_TYPES = Platform.OS === "web"
  ? [".zip", ".xml", ".pdf", "application/zip", "application/x-zip-compressed", "application/xml", "text/xml", "application/pdf"]
  : ["application/zip", "application/x-zip-compressed", "application/xml", "text/xml", "application/pdf"];

/**
 * /receipt: photo (or the parts of a long receipt, top to bottom) → upload → review → points. Also the
 * DIAN e-invoice: uploaded here, or forwarded by email to the address shown and listed for review.
 * `/receipt?draft=<id>` (the link in a reply email) opens that draft. Unconfirmed drafts are dropped
 * by the API after 24 h.
 */
export default function ReceiptScreen() {
  const { area } = useAppState();
  const { user } = useAccount();
  const { draft: draftParam } = useLocalSearchParams<{ draft?: string }>();
  const [stage, setStage] = useState<Stage>(draftParam ? { kind: "opening" } : { kind: "start" });
  const [samples, setSamples] = useState<string[]>([]);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [sending, setSending] = useState(false);
  const alive = useRef(true);

  const loadInbox = useCallback(() => {
    void fetchInbox().then(i => alive.current && setInbox(i)).catch(() => { /* the cards wait for the next visit */ });
  }, []);

  useEffect(() => {
    alive.current = true;
    void fetchSamples().then(s => alive.current && setSamples(s));
    return () => { alive.current = false; };
  }, []);

  // Back on the start: refresh the address, invoices to review and recent outcomes.
  useEffect(() => {
    if (stage.kind === "start") loadInbox();
  }, [stage.kind, loadInbox]);

  // A draft linked from a reply email (or the inbox): only this device's session can open it.
  useEffect(() => {
    if (!draftParam) return;
    setStage({ kind: "opening" });
    fetchDraft(draftParam)
      .then(draft => alive.current && setStage({ kind: "review", draft }))
      .catch((e: unknown) => alive.current && setStage({ kind: "error", einvoice: true, message: e instanceof Error ? e.message : "No pudimos abrir la factura." }));
  }, [draftParam]);

  async function openDraft(id: string) {
    setOpening(id);
    try {
      const draft = await fetchDraft(id);
      if (alive.current) setStage({ kind: "review", draft });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos abrir la factura.");
      loadInbox();
    } finally {
      if (alive.current) setOpening(null);
    }
  }

  // Called straight from the tap: Safari only lets a page write the clipboard inside the gesture.
  function copyAddress() {
    const address = inbox?.address;
    if (!address) return;
    void copyText(address).then(ok => (ok ? toast.success("Dirección copiada") : toast.error("No pudimos copiarla. Mantén presionada la dirección para copiarla.")));
  }

  async function newAddress() {
    setReplacing(true);
    try {
      const address = await replaceAddress();
      if (alive.current) setInbox(i => (i ? { ...i, address } : i));
      toast.success("Listo: la dirección anterior ya no recibe facturas.", { duration: 3600 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos cambiar la dirección.");
    } finally {
      if (alive.current) setReplacing(false);
    }
  }

  // Also straight from the tap: browsers only open the file dialog on a user gesture.
  async function pickInvoice() {
    let picked: InvoiceFile;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: INVOICE_TYPES, copyToCacheDirectory: true, base64: false });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      picked = { uri: asset.uri, name: asset.name || "factura", mimeType: asset.mimeType ?? "application/octet-stream", file: asset.file };
      if (!/\.(zip|xml|pdf)$/i.test(picked.name)) return toast.error(INVOICE_TYPE_MESSAGE, { duration: 3600 });
      if ((asset.size ?? asset.file?.size ?? 0) > MAX_INVOICE_BYTES) return toast.error("El archivo pesa más de 10 MB.");
    } catch {
      return toast.error("No pudimos abrir tus archivos.");
    }
    setStage({ kind: "uploading", progress: 0, parts: 1, einvoice: true });
    try {
      const draft = await uploadEInvoice(picked, area, progress => alive.current && setStage(s => (s.kind === "uploading" ? { ...s, progress } : s)));
      if (alive.current) setStage({ kind: "review", draft });
    } catch (e) {
      if (alive.current) setStage({ kind: "error", einvoice: true, message: e instanceof Error ? e.message : "No pudimos leer la factura." });
    }
  }

  function back() {
    if (stage.kind === "review" || stage.kind === "error" || stage.kind === "parts") {
      // Leaving a draft opened from a link goes to the screen's start, without the link.
      if (draftParam) router.setParams({ draft: undefined });
      return setStage({ kind: "start" });
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function upload(source: { photos: ReceiptPhoto[] } | { sample: string }) {
    const parts = "photos" in source ? source.photos.length : 1;
    setStage({ kind: "uploading", progress: 0, parts });
    try {
      const draft = await uploadReceipt(source, area, progress => alive.current && setStage(s => (s.kind === "uploading" ? { ...s, progress } : s)));
      if (alive.current) setStage({ kind: "review", draft });
    } catch (e) {
      if (alive.current) setStage({ kind: "error", message: e instanceof Error ? e.message : "No pudimos leer la factura." });
    }
  }

  // Called straight from the button press: mobile browsers only open the camera on a user gesture.
  // Each pick adds the next part of the receipt; the person reviews the parts before we read them.
  async function pick(camera: boolean) {
    const have = stage.kind === "parts" ? stage.photos : [];
    const room = MAX_PARTS - have.length;
    if (room <= 0) return;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return toast.error("Necesitamos la cámara para leer la factura. Puedes elegir una foto de tu galería.");
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        // From the gallery, the parts can come in one go, in the order they're tapped.
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: room > 1, selectionLimit: room, orderedSelection: true });
      if (result.canceled || !result.assets?.length) return;
      const added = result.assets.slice(0, room).map(a => ({ uri: a.uri, mimeType: a.mimeType ?? "image/jpeg", file: a.file }));
      if (alive.current) setStage({ kind: "parts", photos: [...have, ...added] });
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

  const title = stage.kind === "review" || stage.kind === "opening" ? "Revisar factura" : stage.kind === "done" ? "Factura enviada" : "Escanear factura";
  const restart = () => {
    if (draftParam) router.setParams({ draft: undefined });
    setStage({ kind: "start" });
  };

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

      {stage.kind === "start" && (
        <Start
          samples={samples}
          onCamera={() => pick(true)}
          onLibrary={() => pick(false)}
          onSample={s => upload({ sample: s })}
          einvoice={
            <EmailInvoiceCard inbox={inbox} signedIn={!!user} onCopy={copyAddress} onReplace={newAddress} replacing={replacing} onUpload={pickInvoice} onAccount={() => router.push("/account")} />
          }
          pending={<PendingInvoices drafts={inbox?.drafts ?? []} opening={opening} onOpen={openDraft} />}
          recent={<RecentOutcomes recent={inbox?.recent ?? []} />}
        />
      )}
      {stage.kind === "parts" && (
        <Parts
          photos={stage.photos}
          onCamera={() => pick(true)}
          onLibrary={() => pick(false)}
          onRemove={i => setStage(stage.photos.length > 1 ? { kind: "parts", photos: stage.photos.filter((_, n) => n !== i) } : { kind: "start" })}
          onRead={() => upload({ photos: stage.photos })}
        />
      )}
      {stage.kind === "uploading" && <Uploading progress={stage.progress} parts={stage.parts} einvoice={stage.einvoice} />}
      {stage.kind === "opening" && (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerTitle}>Abriendo tu factura…</Text>
        </View>
      )}
      {stage.kind === "error" && <Failed message={stage.message} einvoice={stage.einvoice} onRetry={restart} />}
      {stage.kind === "review" && <ReceiptReview draft={stage.draft} sending={sending} signedIn={!!user} onRetake={restart} onSend={send} onAccount={() => router.push("/account")} />}
      {stage.kind === "done" && (
        <ReceiptDone
          result={stage.result}
          store={stage.draft.store}
          einvoice={stage.draft.source === "einvoice"}
          onAnother={restart}
          onRewards={() => router.replace("/profile")}
          onHome={() => router.replace("/")}
          onAccount={() => router.push("/account")}
        />
      )}
    </SafeAreaView>
  );
}

function Start({ samples, onCamera, onLibrary, onSample, einvoice, pending, recent }: {
  samples: string[]; onCamera: () => void; onLibrary: () => void; onSample: (name: string) => void;
  /** The e-invoice cards: forwarding address and upload, invoices to review, recent emailed outcomes */
  einvoice: ReactNode; pending: ReactNode; recent: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {pending}
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

      {einvoice}
      {recent}

      <View style={styles.rules}>
        <Rule icon={<Store size={16} color={colors.primary} />} text="Facturas de D1, Jumbo, Éxito o Carulla" />
        <Rule icon={<CalendarClock size={16} color={colors.primary} />} text="De los últimos 3 días, hasta 5 por día" />
        <Rule icon={<ScanLine size={16} color={colors.primary} />} text="Completa y con buena luz. Si es larga, tómala en varias fotos, de arriba a abajo" />
      </View>
      <Text style={styles.small}>
        Antes de guardar la foto quitamos tu cédula y los datos de tu tarjeta. Los puntos no tienen valor en dinero.
      </Text>
    </ScrollView>
  );
}

/**
 * The photos so far, in order down the receipt. A long receipt is read better in parts than squeezed
 * into one far-away shot; each next photo should repeat a little of the previous one.
 */
function Parts({ photos, onCamera, onLibrary, onRemove, onRead }: {
  photos: ReceiptPhoto[]; onCamera: () => void; onLibrary: () => void; onRemove: (index: number) => void; onRead: () => void;
}) {
  const full = photos.length >= MAX_PARTS;
  const one = photos.length === 1;
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.partsHead}>
        <Text accessibilityRole="header" style={styles.partsTitle}>{one ? "¿Se ve completa?" : `Tu factura en ${photos.length} fotos`}</Text>
        <Text style={styles.partsText}>
          {one
            ? "Debe verse de la tienda, arriba, hasta el número de factura, abajo. Si es larga, agrega la siguiente parte."
            : "Las leemos en este orden, de arriba a abajo, como una sola factura."}
        </Text>
      </View>

      <View style={styles.thumbs}>
        {photos.map((photo, i) => (
          <View key={`${photo.uri}-${i}`} style={styles.thumb}>
            <Image source={{ uri: photo.uri }} style={styles.thumbImage} accessibilityLabel={`Parte ${i + 1} de la factura`} />
            <View style={styles.thumbBadge}><Text style={styles.thumbBadgeText}>{i + 1}</Text></View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar la parte ${i + 1}`}
              onPress={() => onRemove(i)}
              hitSlop={8}
              style={({ pressed }) => [styles.thumbRemove, pressed && styles.pressed]}
            >
              <X size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        ))}
      </View>

      {!full && (
        <View style={styles.tip}>
          <ScanLine size={16} color={colors.primary} />
          <Text style={styles.tipText}>
            Para la parte {photos.length + 1}, sigue bajando por la factura y deja en la foto las últimas líneas de la anterior.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button title={one ? "Leer factura" : `Leer factura (${photos.length} fotos)`} onPress={onRead} icon={<Receipt size={17} color="#FFFFFF" />} />
        {!full && <Button title="Agregar otra parte" variant="outline" onPress={onCamera} icon={<Camera size={17} color={colors.primary} />} />}
        {!full && (
          <Pressable accessibilityRole="button" onPress={onLibrary} hitSlop={6} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={styles.linkText}>Agregar desde la galería</Text>
          </Pressable>
        )}
        {full && <Text style={styles.small}>Llegaste al máximo de {MAX_PARTS} fotos por factura.</Text>}
      </View>
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

function Uploading({ progress, parts, einvoice }: { progress: number; parts: number; einvoice?: boolean }) {
  const reading = progress >= 1;
  const uploading = einvoice ? "Subiendo la factura…" : parts > 1 ? `Subiendo ${parts} fotos…` : "Subiendo la foto…";
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.centerTitle}>{reading ? (einvoice ? "Leyendo tu factura electrónica…" : "Leyendo tu factura…") : uploading}</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((reading ? 1 : progress) * 100)}%` }]} /></View>
      <Text style={styles.centerText}>
        {reading
          ? `Buscamos cada producto en el catálogo de la tienda. ${parts > 1 ? "Una factura larga puede tardar hasta un minuto." : "Puede tardar unos segundos."}`
          : `${Math.round(progress * 100)} %`}
      </Text>
    </View>
  );
}

function Failed({ message, einvoice, onRetry }: { message: string; einvoice?: boolean; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <View style={styles.failIcon}><AlertTriangle size={26} color={colors.warnInk} /></View>
      <Text style={styles.centerTitle}>No pudimos usar esta factura</Text>
      <Text style={styles.centerText}>{message}</Text>
      {einvoice
        ? <Button title="Volver" onPress={onRetry} icon={<Receipt size={16} color="#FFFFFF" />} />
        : <Button title="Tomar la foto de nuevo" onPress={onRetry} icon={<Camera size={16} color="#FFFFFF" />} />}
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
  partsHead: { gap: spacing.xs, paddingTop: spacing.sm },
  partsTitle: { fontSize: fontSize.headline, fontWeight: "800", color: colors.foreground },
  partsText: { fontSize: fontSize.body + 1, lineHeight: 20, color: colors.mutedForeground },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumb: { width: 104, height: 148, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  thumbImage: { width: "100%", height: "100%", resizeMode: "cover" },
  thumbBadge: { position: "absolute", left: 6, top: 6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  thumbBadgeText: { fontSize: fontSize.caption, fontWeight: "800", color: "#FFFFFF" },
  thumbRemove: { position: "absolute", right: 6, top: 6, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  tip: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.secondary },
  tipText: { flex: 1, fontSize: fontSize.caption, lineHeight: 17, color: colors.secondaryForeground },
  link: { alignSelf: "center", paddingVertical: spacing.sm },
  linkText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  failIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.warnSurface, alignItems: "center", justifyContent: "center" },
});
