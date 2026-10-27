import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle, Camera, CheckCircle2, CircleSlash, FlaskConical, Info } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { Button, Sheet } from "@/components/ui";
import { cop } from "@/lib/market";
import { reconcileLines, type ListingOption, type ReceiptDraft, type ReviewLine } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { LineRow, lineCounts } from "./line-row";

/**
 * The person checks what we read before anything is saved. The header is read-only (it identifies the
 * receipt); lines can be corrected, re-matched or left out. Only lines that pass the check, have a
 * product and are included become prices.
 */
export function ReceiptReview({ draft, sending, onRetake, onSend }: {
  draft: ReceiptDraft; sending: boolean; onRetake: () => void; onSend: (lines: ReviewLine[]) => void;
}) {
  const [lines, setLines] = useState<ReviewLine[]>(() => draft.lines.map(l => ({ ...l, excluded: false, noMatch: false, edited: false })));
  const [picking, setPicking] = useState<number | null>(null);
  const counted = lines.filter(lineCounts).length;
  const items = lines.filter(l => l.kind === "item").length;
  const sums = useMemo(() => reconcileLines(lines, draft.total), [lines, draft.total]);
  const pickingLine = picking === null ? null : lines.find(l => l.index === picking) ?? null;

  const update = (next: ReviewLine) => setLines(all => all.map(l => (l.index === next.index ? next : l)));

  function choose(option: ListingOption | null) {
    if (!pickingLine) return;
    const original = draft.lines.find(l => l.index === pickingLine.index)?.match;
    const same = option && original && original.listingId === option.listingId && original.name === option.name;
    update(option
      ? { ...pickingLine, noMatch: false, match: same ? original : { ...option, by: "user" } }
      : { ...pickingLine, noMatch: true });
    setPicking(null);
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>Revisa lo que leímos</Text>
        <Text style={styles.lede}>Corrige lo que no coincida con tu factura. Solo guardamos los precios que confirmes.</Text>

        {draft.demo && (
          <View style={styles.demo}>
            <FlaskConical size={15} color={colors.warnInk} />
            <Text style={styles.demoText}>Factura de ejemplo: la lectura fue grabada antes para la demostración, no la hizo la IA ahora.</Text>
          </View>
        )}

        <View style={styles.paper}>
          <View style={styles.paperTop}>
            <StoreLogo store={draft.store} />
            <View style={styles.paperBody}>
              <Text style={styles.store}>{draft.store}</Text>
              {!!draft.branch && <Text numberOfLines={1} style={styles.paperMeta}>{draft.branch}</Text>}
            </View>
          </View>
          <View style={styles.paperRows}>
            <PaperRow label="Fecha" value={formatDate(draft.purchasedAt)} />
            <PaperRow label="Factura" value={draft.invoiceNumber} />
            <PaperRow label="Total impreso" value={draft.total === null ? "No se lee" : cop(draft.total)} strong />
          </View>
          <Pressable accessibilityRole="button" onPress={onRetake} hitSlop={6} style={styles.retake}>
            <Camera size={14} color={colors.primary} />
            <Text style={styles.retakeText}>Tomar la foto de nuevo</Text>
          </Pressable>
        </View>

        <Reconciliation difference={sums.difference} linesTotal={sums.linesTotal} printed={draft.total} />

        <Text style={styles.count}>{counted} de {items} productos suman puntos</Text>

        <View style={styles.lines}>
          {lines.map(line => (
            <LineRow key={line.index} line={line} onChange={update} onPickProduct={() => setPicking(line.index)} />
          ))}
        </View>

        <View style={styles.note}>
          <Info size={13} color={colors.mutedForeground} />
          <Text style={styles.noteText}>
            Los precios se muestran como “Reportado en tienda · factura” durante 2 días. Los puntos no tienen valor en dinero.
          </Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Button
          title={counted ? `Enviar ${counted} ${counted === 1 ? "precio" : "precios"}` : "Ningún precio para enviar"}
          disabled={!counted}
          loading={sending}
          onPress={() => onSend(lines)}
        />
      </SafeAreaView>

      <Sheet visible={!!pickingLine} onClose={() => setPicking(null)}>
        {pickingLine && (
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
            <Text style={styles.sheetTitle}>¿Qué producto es?</Text>
            <Text style={styles.sheetLine}>{pickingLine.text}</Text>
            {[...(pickingLine.match && pickingLine.match.by !== "user" ? [pickingLine.match] : []), ...pickingLine.options]
              .filter((o, i, all) => all.findIndex(x => x.listingId === o.listingId && x.name === o.name) === i)
              .map(option => {
                const selected = !pickingLine.noMatch && pickingLine.match?.listingId === option.listingId && pickingLine.match?.name === option.name;
                return (
                  <Pressable key={`${option.listingId}:${option.name}`} accessibilityRole="button" onPress={() => choose(option)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
                    {option.image ? <Image source={{ uri: option.image }} style={styles.optionImage} /> : <View style={styles.optionImage} />}
                    <View style={styles.optionBody}>
                      <Text numberOfLines={2} style={styles.optionName}>{option.name}</Text>
                      {!!option.size && <Text style={styles.optionMeta}>{option.size}</Text>}
                    </View>
                    {selected && <CheckCircle2 size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            {pickingLine.options.length === 0 && !pickingLine.match && (
              <Text style={styles.sheetEmpty}>No encontramos productos parecidos en {draft.store}.</Text>
            )}
            <Pressable accessibilityRole="button" onPress={() => choose(null)} style={({ pressed }) => [styles.option, pickingLine.noMatch && styles.optionSelected, pressed && styles.pressed]}>
              <View style={[styles.optionImage, styles.noneIcon]}><CircleSlash size={16} color={colors.mutedForeground} /></View>
              <View style={styles.optionBody}>
                <Text style={styles.optionName}>No está en la lista</Text>
                <Text style={styles.optionMeta}>Este precio no se guarda</Text>
              </View>
            </Pressable>
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

function PaperRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.paperRow}>
      <Text style={styles.paperLabel}>{label}</Text>
      <Text style={[styles.paperValue, strong && styles.paperStrong]}>{value}</Text>
    </View>
  );
}

/** Whether what we read adds up to the printed total. Never hides a difference. */
function Reconciliation({ difference, linesTotal, printed }: { difference: number | null; linesTotal: number; printed: number | null }) {
  if (printed === null) {
    return (
      <Banner tone="idle" text={`No pudimos leer el total impreso. Las líneas suman ${cop(linesTotal)}.`} />
    );
  }
  if (Math.abs(difference ?? 0) <= 1) return <Banner tone="ok" text={`Las líneas suman ${cop(linesTotal)}, igual que el total de la factura.`} />;
  return (
    <Banner
      tone="warn"
      text={`Las líneas suman ${cop(linesTotal)} y la factura dice ${cop(printed)}: ${difference! > 0 ? "faltan" : "sobran"} ${cop(Math.abs(difference!))}. Revisa las líneas marcadas.`}
    />
  );
}

function Banner({ tone, text }: { tone: "ok" | "warn" | "idle"; text: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : Info;
  const color = tone === "ok" ? colors.primary : tone === "warn" ? colors.warnInk : colors.mutedForeground;
  return (
    <View style={[styles.banner, tone === "ok" && styles.bannerOk, tone === "warn" && styles.bannerWarn]}>
      <Icon size={16} color={color} />
      <Text style={[styles.bannerText, { color }]}>{text}</Text>
    </View>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.headline, fontWeight: "800", color: colors.foreground },
  lede: { marginTop: -spacing.sm, fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  demo: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warnSurface },
  demoText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, fontWeight: "600", color: colors.warnInk },
  paper: {
    gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.receiptBg,
    borderWidth: 1, borderColor: colors.photoFrame, borderStyle: "dashed",
  },
  paperTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  paperBody: { flex: 1, minWidth: 0 },
  store: { fontSize: fontSize.title, fontWeight: "800", color: colors.receiptInk },
  paperMeta: { fontSize: fontSize.caption, color: colors.receiptMuted },
  paperRows: { gap: 6 },
  paperRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  paperLabel: { fontSize: fontSize.body, color: colors.receiptMuted },
  paperValue: { flexShrink: 1, textAlign: "right", fontSize: fontSize.body, fontWeight: "600", color: colors.receiptInk, fontVariant: ["tabular-nums"] },
  paperStrong: { fontSize: fontSize.subhead, fontWeight: "800" },
  retake: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  retakeText: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  banner: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted },
  bannerOk: { backgroundColor: colors.secondary },
  bannerWarn: { backgroundColor: colors.warnSurface },
  bannerText: { flex: 1, fontSize: fontSize.body, lineHeight: 18, fontWeight: "600" },
  count: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.foreground, marginTop: spacing.xs },
  lines: { gap: spacing.sm },
  note: { flexDirection: "row", gap: 6, paddingTop: spacing.sm },
  noteText: { flex: 1, fontSize: fontSize.caption, lineHeight: 16, color: colors.mutedForeground },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  sheetScroll: { maxHeight: 520 },
  sheet: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sheetTitle: { fontSize: fontSize.title, fontWeight: "800", color: colors.foreground },
  sheetLine: { fontSize: fontSize.body, fontWeight: "700", color: colors.receiptMuted, marginBottom: spacing.xs },
  sheetEmpty: { fontSize: fontSize.body, color: colors.mutedForeground },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  pressed: { opacity: 0.7 },
  optionImage: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.imageBg },
  noneIcon: { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { fontSize: fontSize.body, fontWeight: "700", color: colors.foreground },
  optionMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
});
