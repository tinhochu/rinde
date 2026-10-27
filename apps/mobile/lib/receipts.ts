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
export type ReceiptDraft = {
  id: string; store: Store; branch: string; purchasedAt: string; total: number | null; invoiceNumber: string; demo: boolean;
  lines: DraftLine[]; reconciliation: Reconciliation;
};
export type ConfirmEdit = { index: number; excluded?: boolean; quantity?: number; unitPrice?: number; total?: number; listingId?: string; noMatch?: boolean };
export type Badge = { id: string; name: string; description: string };
export type ConfirmResult = {
  receiptId: string; points: number; breakdown: { label: string; points: number; lines: number }[];
  acceptedLines: number; badges: Badge[]; balance: number;
};
export type RankRow = { rank: number; name: string; points: number; you: boolean };
export type MyRewards = {
  points: number; name: string; zone: string;
  badges: (Badge & { earnedAt: string })[];
  history: { label: string; points: number; at: string }[];
  rank: RankRow | null;
};
export type Leaderboard = { zone: string; weekStart: string; top: RankRow[]; you: RankRow | null };

/** A photo to upload: a web `File`, or a native file uri. */
export type ReceiptPhoto = { file?: Blob; uri: string; mimeType: string };

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

/**
 * Uploads a photo (or names a sample) and resolves with the draft. XHR rather than fetch so the
 * screen can show real upload progress; `onUploaded` fires once the bytes are sent and the server
 * starts reading the receipt.
 */
export async function uploadReceipt(
  source: { photo: ReceiptPhoto } | { sample: string },
  zone: string,
  onProgress: (fraction: number) => void,
): Promise<ReceiptDraft> {
  const form = new FormData();
  if ("sample" in source) form.append("sample", source.sample);
  else if (Platform.OS === "web" && source.photo.file) form.append("image", source.photo.file, "factura.jpg");
  else form.append("image", { uri: source.photo.uri, type: source.photo.mimeType, name: "factura.jpg" } as unknown as Blob);
  if (zone) form.append("zone", zone);
  const head = await headers();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/api/receipts`);
    for (const [k, v] of Object.entries(head)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => reject(new Error(OFFLINE));
    xhr.onload = () => {
      let data: unknown = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep {} */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as ReceiptDraft);
      else reject(new Error((data as { error?: string }).error || "No pudimos leer la factura. Intenta de nuevo."));
    };
    xhr.send(form);
  });
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
