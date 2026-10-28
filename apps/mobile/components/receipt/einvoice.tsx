import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertCircle, CheckCircle2, ChevronRight, Copy, FileUp, Mail, RefreshCw } from "lucide-react-native";
import { StoreLogo } from "@/components/brand";
import { Button } from "@/components/ui";
import type { Inbox, InboxDraft, InboxOutcome } from "@/lib/receipts";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// E-invoice parts of the receipt screen's start: invoices received by email waiting for review, the
// forwarding address with the upload door, and what became of recent forwarded emails.

/** "Facturas por revisar": each opens its review. */
export function PendingInvoices({ drafts, opening, onOpen }: { drafts: InboxDraft[]; opening: string | null; onOpen: (id: string) => void }) {
  if (drafts.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Facturas por revisar</Text>
      <Text style={styles.cardText}>Tus facturas electrónicas sin enviar. Revísalas para compartir sus precios.</Text>
      <View style={styles.list}>
        {drafts.map((d, i) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={`Revisar factura de ${d.store}, ${shortDate(d.purchasedAt)}, ${count(d.lines)}`}
            onPress={() => onOpen(d.id)}
            disabled={opening !== null}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, (pressed || opening === d.id) && styles.pressed]}
          >
            <StoreLogo store={d.store} small />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{d.store}</Text>
              <Text style={styles.rowMeta}>{shortDate(d.purchasedAt)} · {count(d.lines)}</Text>
            </View>
            <Text style={styles.rowAction}>{opening === d.id ? "Abriendo…" : "Revisar"}</Text>
            <ChevronRight size={18} color={colors.primary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * "¿Te llegó la factura por correo?": the personal forwarding address (hidden while receiving email is
 * off), copy and replace, and the upload of the .zip, .xml or .pdf.
 */
export function EmailInvoiceCard({ inbox, onCopy, onReplace, replacing, onUpload }: {
  inbox: Inbox | null; onCopy: () => void; onReplace: () => void; replacing: boolean; onUpload: () => void;
}) {
  const address = inbox?.address ?? null;
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleIcon}><Mail size={17} color={colors.primary} /></View>
        <Text accessibilityRole="header" style={[styles.cardTitle, styles.flex]}>
          {address ? "¿Te llegó la factura por correo?" : "¿Tienes la factura electrónica?"}
        </Text>
      </View>
      {address ? (
        <>
          <Text style={styles.cardText}>Reenvía aquí el correo de tu factura electrónica. Leemos los precios exactos, sin foto.</Text>
          <View style={styles.address}>
            {/* Two lines, split at the @, so the whole address is always visible; "Copiar" copies it in one piece. */}
            <View style={styles.addressBody} accessible accessibilityLabel={address}>
              <Text selectable numberOfLines={1} style={styles.addressText}>{address.split("@")[0]}</Text>
              <Text selectable numberOfLines={1} style={styles.addressDomain}>@{address.split("@")[1]}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copiar la dirección"
              onPress={onCopy}
              hitSlop={6}
              style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
            >
              <Copy size={15} color="#FFFFFF" />
              <Text style={styles.copyText}>Copiar</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.cardText}>Sube el archivo que te llegó por correo de D1, Jumbo, Éxito o Carulla. Leemos los precios exactos, sin foto.</Text>
      )}
      <Button title="Subir factura electrónica" variant="outline" onPress={onUpload} icon={<FileUp size={17} color={colors.primary} />} />
      {address && (
        <Pressable accessibilityRole="button" onPress={onReplace} disabled={replacing} hitSlop={6} style={({ pressed }) => [styles.replace, (pressed || replacing) && styles.pressed]}>
          <RefreshCw size={13} color={colors.mutedForeground} />
          <Text style={styles.replaceText}>{replacing ? "Cambiando…" : "Cambiar dirección"}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The last 7 days of forwarded emails: accepted, or why not. */
export function RecentOutcomes({ recent }: { recent: InboxOutcome[] }) {
  if (recent.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Correos recibidos</Text>
      <View style={styles.list}>
        {recent.map((r, i) => {
          const ok = r.status === "accepted";
          return (
            <View key={r.id} style={[styles.outcome, i > 0 && styles.rowBorder]}>
              {ok ? <CheckCircle2 size={17} color={colors.primary} /> : <AlertCircle size={17} color={colors.warnInk} />}
              <View style={styles.rowBody}>
                <Text style={[styles.outcomeText, !ok && styles.outcomeWarn]}>
                  {ok ? `Factura de ${r.store ?? "la tienda"} recibida` : r.message ?? "No pudimos usar este correo."}
                </Text>
                <Text style={styles.rowMeta}>{ago(r.at)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const count = (n: number) => (n === 1 ? "1 producto" : `${n} productos`);

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(iso));
}

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  titleIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: fontSize.subhead + 1, fontWeight: "800", color: colors.foreground },
  cardText: { fontSize: fontSize.body, lineHeight: 19, color: colors.mutedForeground },
  list: { marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: fontSize.subhead, fontWeight: "700", color: colors.foreground },
  rowMeta: { fontSize: fontSize.caption, color: colors.mutedForeground },
  rowAction: { fontSize: fontSize.body, fontWeight: "700", color: colors.primary },
  pressed: { opacity: 0.6 },
  address: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs, paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.secondaryBorder,
  },
  addressBody: { flex: 1, minWidth: 0 },
  addressText: { fontSize: fontSize.subhead, fontWeight: "800", color: colors.secondaryForeground },
  addressDomain: { fontSize: fontSize.body, fontWeight: "600", color: colors.secondaryForeground },
  copy: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.md - 2, backgroundColor: colors.primary },
  copyText: { fontSize: fontSize.body, fontWeight: "800", color: "#FFFFFF" },
  replace: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", minHeight: 32 },
  replaceText: { fontSize: fontSize.caption + 1, fontWeight: "700", color: colors.mutedForeground },
  outcome: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm },
  outcomeText: { fontSize: fontSize.body, lineHeight: 18, fontWeight: "600", color: colors.foreground },
  outcomeWarn: { color: colors.warnInk },
});
