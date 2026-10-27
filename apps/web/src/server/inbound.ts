import "server-only";
import { Webhook } from "svix";
import { db, type Prisma } from "@rinde/db";
import { EINVOICE_MESSAGES, intakeInvoiceFiles, type IncomingFile } from "./einvoice";
import { inboundConfig, resolveRecipient } from "./forwarding";
import { resultsJson, summarize } from "./inbox";
import { sha256 } from "./muse";
import { sendIntakeReply } from "./reply";

/**
 * Forwarded e-invoice emails through Resend Inbound (einvoice-intake spec): a signed `email.received`
 * webhook is recorded at once (one row per Resend email id, so retries are idempotent) and processed
 * right after the response. Email bodies are never fetched or stored; attachments stay in memory.
 */

export const EMAILS_PER_DAY = 20;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** RESEND_API_URL only points local end-to-end checks at a stand-in; production uses Resend. */
const resendApi = () => (process.env["RESEND_API_URL"] || "https://api.resend.com").replace(/\/$/, "");

export type ReceivedEmail = { email_id: string; from?: string; to?: string[]; cc?: string[]; received_for?: string[] };

/** Verifies the Svix signature over the raw body. Null when it doesn't verify. */
export function verifyWebhook(raw: string, headers: Headers, secret: string): { type: string; data: ReceivedEmail } | null {
  const svix = { "svix-id": headers.get("svix-id") ?? "", "svix-timestamp": headers.get("svix-timestamp") ?? "", "svix-signature": headers.get("svix-signature") ?? "" };
  if (!svix["svix-id"] || !svix["svix-timestamp"] || !svix["svix-signature"]) return null;
  try {
    // Throws unless the signature matches the raw body (and the timestamp is recent).
    new Webhook(secret).verify(raw, svix);
    return JSON.parse(raw) as { type: string; data: ReceivedEmail };
  } catch {
    return null;
  }
}

/** Records a received email once; null when this email id was already recorded (a webhook retry). */
export async function recordReceived(emailId: string) {
  try {
    return await db().invoiceIntake.create({ data: { via: "email", resendEmailId: emailId.slice(0, 100), status: "received" } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}

type Fetch = typeof fetch;
const resendHeaders = () => {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return { Authorization: `Bearer ${key}` };
};

async function resendJson<T>(path: string, fetcher: Fetch): Promise<T> {
  const response = await fetcher(`${resendApi()}${path}`, { headers: resendHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Resend ${response.status} on ${path.replace(/[0-9a-f-]{36}/g, ":id")}`);
  return response.json() as Promise<T>;
}

type AttachmentMeta = { id: string; filename: string; size?: number; content_type?: string; download_url: string };

const INVOICE_TYPES = /zip|xml|pdf/i;
/** By extension; the content type only for an attachment without one. */
const isInvoiceFile = (a: AttachmentMeta) =>
  /\.[a-z0-9]{1,5}$/i.test(a.filename ?? "") ? /\.(zip|xml|pdf)$/i.test(a.filename) : INVOICE_TYPES.test(a.content_type ?? "");

/** Downloads one attachment, refusing it past 10 MB whatever its declared size. */
async function download(url: string, fetcher: Fetch): Promise<Uint8Array | null> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`attachment download ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_ATTACHMENT_BYTES) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Start of today in Colombia (UTC−5). */
function colombiaDay(now: Date) {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 5 * 3_600_000);
}

/** Counts this email against the address's day; returns the count including it. */
async function countEmail(addressId: string, now: Date): Promise<number> {
  return db().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ emailsToday: number; countedOn: Date | null }[]>`
      SELECT "emailsToday", "countedOn" FROM "ForwardingAddress" WHERE id = ${addressId} FOR UPDATE`;
    const day = colombiaDay(now);
    const sameDay = rows[0]?.countedOn && rows[0].countedOn >= day;
    const count = sameDay ? rows[0]!.emailsToday + 1 : 1;
    await tx.forwardingAddress.update({ where: { id: addressId }, data: { emailsToday: count, countedOn: sameDay ? rows[0]!.countedOn! : now } });
    return count;
  });
}

async function finish(intakeId: string, data: Prisma.InvoiceIntakeUpdateInput) {
  await db().invoiceIntake.update({ where: { id: intakeId }, data });
}

/**
 * Processes a recorded email once: recipient → address (unknown or replaced: dropped before any
 * download), the daily limit, the attachments through the shared intake, the outcome, and one reply.
 * `email` is the webhook's metadata; the worker's retry passes none and it is fetched again.
 */
export async function processIntake(intakeId: string, email?: ReceivedEmail, opts: { fetch?: Fetch; now?: Date } = {}) {
  const fetcher = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? new Date();
  const prisma = db();
  const intake = await prisma.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake || intake.status !== "received" || !intake.resendEmailId) return;
  // Claim this attempt: a concurrent run (webhook and worker retry) gets 0 rows and stops.
  const claimed = await prisma.invoiceIntake.updateMany({ where: { id: intakeId, status: "received", attempts: intake.attempts }, data: { attempts: intake.attempts + 1 } });
  if (claimed.count === 0) return;

  const meta = email ?? await resendJson<ReceivedEmail & { id: string }>(`/emails/receiving/${encodeURIComponent(intake.resendEmailId)}`, fetcher);
  const address = await resolveRecipient([...(meta.to ?? []), ...(meta.cc ?? []), ...(meta.received_for ?? [])]);
  if (!address) return finish(intakeId, { status: "dropped" });
  const owner = { contributor: { connect: { id: address.contributorId } }, address: { connect: { id: address.id } } };

  // A retried attempt was already counted the first time.
  const count = intake.attempts === 0 ? await countEmail(address.id, now) : 0;
  if (count > EMAILS_PER_DAY) {
    // The first email over the limit leaves one message for the day; later ones are dropped silently.
    return finish(intakeId, count === EMAILS_PER_DAY + 1 ? { ...owner, status: "rejected", message: EINVOICE_MESSAGES.flood } : { ...owner, status: "dropped" });
  }

  const listed = await resendJson<{ data: AttachmentMeta[] }>(`/emails/receiving/${encodeURIComponent(intake.resendEmailId)}/attachments`, fetcher);
  const candidates = listed.data.filter(isInvoiceFile).slice(0, 10);
  const files: IncomingFile[] = [];
  let oversized = false;
  for (const a of candidates) {
    if ((a.size ?? 0) > MAX_ATTACHMENT_BYTES) { oversized = true; continue; }
    const data = await download(a.download_url, fetcher);
    if (data) files.push({ name: a.filename || "adjunto", data });
    else oversized = true;
  }

  const contributor = await prisma.contributor.findUniqueOrThrow({ where: { id: address.contributorId } });
  const outcomes = files.length || !oversized
    ? await intakeInvoiceFiles({ contributor, files, via: "email", now })
    : [{ status: "rejected" as const, code: "unreadable", message: EINVOICE_MESSAGES.unreadable, httpStatus: 413 }];
  const summary = summarize(outcomes);
  await finish(intakeId, {
    ...owner, status: summary.status, message: summary.message, receiptId: summary.receiptId, store: summary.store,
    results: resultsJson(outcomes) as Prisma.InputJsonValue, fileHashes: files.map((f) => sha256(f.data)),
  });

  // At most one reply per email: the flag flips once, before sending.
  if (meta.from && (await prisma.invoiceIntake.updateMany({ where: { id: intakeId, replied: false }, data: { replied: true } })).count === 1) {
    await sendIntakeReply(meta.from, summary, fetcher).catch((e: unknown) => console.warn(`[inbound] reply failed: ${e instanceof Error ? e.message : "error"}`));
  }
}

/** The inbound route is off unless both the webhook secret and the inbound domain are set. */
export const inboundEnabled = () => inboundConfig() !== null;
