import { Platform } from "react-native";
import { checkLine, reconcile, type LineIssue, type ParsedLine, type Reconciliation, type SaleUnit } from "@rinde/core";
import { apiBase } from "./api";
import type { Store } from "./market";
import { sessionId } from "./session";

// Wire types for /api/receipts and /api/rewards (see apps/web/src/server/receipts.ts and rewards.ts). Keep in sync.
export type ListingOption = { listingId: string; name: string; image: string | null; size: string };
export type LineMatch = ListingOption & {
  listingId: string | null;
  by: "ean" | "code" | "alias" | "search" | "produce" | "user";
  produce?: { slug: string; name: string; unit: "kg" | "unit" };
};
export type DraftLine = {
  index: number;
  kind: "item" | "discount";
  text: string;
  code: string | null;
  quantity: { value: number; unit: string } | null;
  unitPrice: number | null;
  total: number | null;
  check: "ok" | LineIssue;
  match: LineMatch | null;
  options: ListingOption[];
};
/** How a receipt arrived: a photo, a DIAN e-invoice's XML, or its PDF read like a photo. */
export type ReceiptSource = "photo" | "einvoice" | "einvoice-pdf";
export type ReceiptDraft = {
  id: string; store: Store; branch: string; purchasedAt: string; total: number | null; invoiceNumber: string; demo: boolean;
  lines: DraftLine[]; reconciliation: Reconciliation;
  cufe?: string | null;
  source?: ReceiptSource;
  /** An e-invoice whose DIAN validation matched its CUFE */
  dianConfirmed?: boolean;
  /** Pesos the lines may differ from the total and still add up (an e-invoice's rounding); 1 for photos */
  tolerance?: number;
};
/** An e-invoice draft waiting for review, and what became of recent forwarded emails (GET /api/receipts/inbox). */
export type InboxDraft = { id: string; store: Store; purchasedAt: string; lines: number; source: string };
export type InboxOutcome = { id: string; status: "accepted" | "rejected"; message: string | null; store: Store | null; at: string };
/** `address` is null while receiving email is off; uploading still works. */
export type Inbox = { address: string | null; drafts: InboxDraft[]; recent: InboxOutcome[] };
/** An e-invoice file picked from the phone: a web `File`, or a native file uri. */
export type InvoiceFile = { file?: Blob; uri: string; name: string; mimeType: string };
/** The API's limit for an e-invoice file. */
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
export const INVOICE_TYPE_MESSAGE = "Sube el archivo .zip, .xml o .pdf de tu factura electrónica.";

export const isEInvoice = (draft: ReceiptDraft) => draft.source === "einvoice" || draft.source === "einvoice-pdf";
export type ConfirmEdit = { index: number; excluded?: boolean; quantity?: number; unitPrice?: number; total?: number; listingId?: string; noMatch?: boolean };
export type Badge = { id: string; name: string; description: string };
export type ConfirmResult = {
  receiptId: string; points: number; breakdown: { label: string; points: number; lines: number }[];
  acceptedLines: number; badges: Badge[]; balance: number;
};
export type RankRow = { rank: number; name: string; points: number; you: boolean };
export type BadgeId = "primera-factura" | "cazador-de-frutas" | "pionero" | "constante";
export type Achievement = { id: BadgeId; name: string; description: string; target: number; progress: number; earnedAt: string | null };
/** draft: read but never sent; confirmed: its accepted prices count; revoked: annulled afterwards, with the reason. */
export type ReceiptSummary = {
  id: string; store: string; purchasedAt: string; status: "draft" | "confirmed" | "revoked";
  acceptedLines: number; points: number; reason: string | null;
};
export type MyRewards = {
  points: number; name: string; zone: string;
  badges: (Badge & { earnedAt: string })[];
  achievements: Achievement[];
  receipts: { confirmed: number; revoked: number; prices: number };
  recentReceipts: ReceiptSummary[];
  history: { label: string; points: number; at: string }[];
  rank: RankRow | null;
};
export type Leaderboard = { zone: string; weekStart: string; top: RankRow[]; you: RankRow | null };

/** A photo to upload: a web `File`, or a native file uri. */
export type ReceiptPhoto = { file?: Blob; uri: string; mimeType: string };
/** Photos of one long receipt, top to bottom (the API's MAX_PARTS). */
export const MAX_PARTS = 4;

const BASE = apiBase();

async function headers(json = false): Promise<Record<string, string>> {
  return { ...(json ? { "Content-Type": "application/json" } : {}), "X-Rinde-Session": await sessionId() };
}

const OFFLINE = "No hay conexión. Revisa tu internet e intenta de nuevo.";

/** fetch, with a network failure turned into a message people can act on. */
function request(url: string, init?: RequestInit) {
  return fetch(url, init).catch((e: unknown) => {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new Error(OFFLINE);
  });
}

async function parse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "No pudimos leer la factura. Intenta de nuevo.");
  return data as T;
}

/** Recorded sample receipts the API offers in demo mode; empty otherwise. */
export async function fetchSamples(): Promise<string[]> {
  const data = await fetch(`${BASE}/api/receipts/sample`).then(r => parse<{ samples: string[] }>(r)).catch(() => ({ samples: [] }));
  return data.samples;
}

/** XHR upload with progress, resolving with the parsed JSON or rejecting with the API's message. */
function xhrUpload<T>(path: string, form: FormData, head: Record<string, string>, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    for (const [k, v] of Object.entries(head)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => reject(new Error(OFFLINE));
    xhr.onload = () => {
      let data: unknown = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep {} */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new Error((data as { error?: string }).error || "No pudimos leer la factura. Intenta de nuevo."));
    };
    xhr.send(form);
  });
}

/**
 * Uploads a photo (or names a sample) and resolves with the draft. XHR rather than fetch so the
 * screen can show real upload progress; `onUploaded` fires once the bytes are sent and the server
 * starts reading the receipt.
 */
export async function uploadReceipt(
  source: { photos: ReceiptPhoto[] } | { sample: string },
  zone: string,
  onProgress: (fraction: number) => void,
): Promise<ReceiptDraft> {
  const form = new FormData();
  if ("sample" in source) form.append("sample", source.sample);
  else {
    // In order down the paper: the API reads them as one receipt.
    source.photos.forEach((photo, i) => {
      const name = `factura-${i + 1}.jpg`;
      if (Platform.OS === "web" && photo.file) form.append("image", photo.file, name);
      else form.append("image", { uri: photo.uri, type: photo.mimeType, name } as unknown as Blob);
    });
  }
  if (zone) form.append("zone", zone);
  return xhrUpload<ReceiptDraft>("/api/receipts", form, await headers(), onProgress);
}

/** Uploads the e-invoice's .zip, .xml or .pdf; resolves with the draft, through the same checks as a forwarded email. */
export async function uploadEInvoice(invoice: InvoiceFile, zone: string, onProgress: (fraction: number) => void): Promise<ReceiptDraft> {
  const form = new FormData();
  if (Platform.OS === "web" && invoice.file) form.append("file", invoice.file, invoice.name);
  else form.append("file", { uri: invoice.uri, type: invoice.mimeType, name: invoice.name } as unknown as Blob);
  if (zone) form.append("zone", zone);
  return xhrUpload<ReceiptDraft>("/api/receipts/einvoice", form, await headers(), onProgress);
}

/** The forwarding address, e-invoices waiting for review and recent emailed outcomes. */
export async function fetchInbox(signal?: AbortSignal): Promise<Inbox> {
  return request(`${BASE}/api/receipts/inbox`, { headers: await headers(), signal }).then(r => parse<Inbox>(r));
}

/** "Cambiar dirección": a new forwarding address; the old one stops accepting invoices. */
export async function replaceAddress(): Promise<string> {
  return request(`${BASE}/api/receipts/inbox/address`, { method: "POST", headers: await headers() }).then(r => parse<{ address: string }>(r)).then(d => d.address);
}

/** A draft to review again (from the inbox or a reply email's link); only this device's session can open it. */
export async function fetchDraft(id: string): Promise<ReceiptDraft> {
  return request(`${BASE}/api/receipts/${encodeURIComponent(id)}`, { headers: await headers() }).then(r => parse<ReceiptDraft>(r));
}

export async function confirmReceipt(id: string, lines: ConfirmEdit[]): Promise<ConfirmResult> {
  return request(`${BASE}/api/receipts/${encodeURIComponent(id)}/confirm`, {
    method: "POST", headers: await headers(true), body: JSON.stringify({ lines }),
  }).then(r => parse<ConfirmResult>(r));
}

export async function fetchRewards(signal?: AbortSignal): Promise<MyRewards> {
  return request(`${BASE}/api/rewards/me`, { headers: await headers(), signal }).then(r => parse<MyRewards>(r));
}

export async function fetchLeaderboard(zone: string, signal?: AbortSignal): Promise<Leaderboard> {
  return request(`${BASE}/api/rewards/leaderboard?zone=${encodeURIComponent(zone)}`, { headers: await headers(), signal }).then(r => parse<Leaderboard>(r));
}

export async function saveDisplayName(name: string): Promise<MyRewards> {
  return request(`${BASE}/api/rewards/me`, { method: "PATCH", headers: await headers(true), body: JSON.stringify({ name }) }).then(r => parse<MyRewards>(r));
}

// ── Review state ──────────────────────────────────────────────────────────────

/** A line as the person has it on the review screen: the draft plus their edits. */
export type ReviewLine = DraftLine & { excluded: boolean; noMatch: boolean; edited: boolean };

const SALE_UNITS: SaleUnit[] = ["unit", "kg", "g", "l", "ml"];

/** The draft line in the shape the shared core checks read. Base amounts aren't used by the checks. */
function parsed(line: ReviewLine): ParsedLine {
  const unit = (SALE_UNITS as string[]).includes(line.quantity?.unit ?? "") ? (line.quantity!.unit as SaleUnit) : "unit";
  return {
    index: line.index, kind: line.kind, text: line.text, code: line.code, unitPrice: line.unitPrice, total: line.total,
    quantity: line.quantity ? { value: line.quantity.value, unit, base: { amount: line.quantity.value, unit: "unit" } } : null,
  };
}

/** The same quantity × price check the API runs on confirm, recomputed after each edit. */
export function lineCheck(line: ReviewLine): "ok" | LineIssue {
  const c = checkLine(parsed(line));
  return c.ok ? "ok" : c.issue!;
}

/**
 * Every printed line (as corrected) against the printed total: it checks the reading, so a line left
 * out of the prices, like a bag, still counts toward the sum.
 */
export function reconcileLines(lines: ReviewLine[], printedTotal: number | null): Reconciliation {
  return reconcile(lines.map(parsed), printedTotal);
}

/** Only what changed, in the confirm endpoint's shape. */
export function editsFor(lines: ReviewLine[], draft: ReceiptDraft): ConfirmEdit[] {
  const original = new Map(draft.lines.map(l => [l.index, l]));
  return lines.flatMap(l => {
    const o = original.get(l.index)!;
    const edit: ConfirmEdit = { index: l.index };
    if (l.excluded) edit.excluded = true;
    if (l.noMatch) edit.noMatch = true;
    if (l.quantity && l.quantity.value !== o.quantity?.value) edit.quantity = l.quantity.value;
    if (l.unitPrice !== null && l.unitPrice !== o.unitPrice) edit.unitPrice = l.unitPrice;
    if (l.total !== null && l.total !== o.total) edit.total = l.total;
    if (!l.noMatch && l.match?.listingId && l.match.listingId !== o.match?.listingId) edit.listingId = l.match.listingId;
    return Object.keys(edit).length > 1 ? [edit] : [];
  });
}
