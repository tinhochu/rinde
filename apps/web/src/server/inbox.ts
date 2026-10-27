import "server-only";
import { db, type RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG, type Store } from "./contract";
import type { IntakeOutcome } from "./einvoice";
import { activeAddress, addressText, inboundConfig, rotateAddress } from "./forwarding";

// Wire types (apps/mobile/lib/receipts.ts mirrors these).
export type InboxDraft = { id: string; store: Store; purchasedAt: string; lines: number; source: string };
export type InboxOutcome = { id: string; status: "accepted" | "rejected"; message: string | null; store: Store | null; at: string };
export type Inbox = { address: string | null; drafts: InboxDraft[]; recent: InboxOutcome[] };

const RECENT_DAYS = 7;

/**
 * What the receipt screen shows about e-invoices: the forwarding address (created on first view; null
 * while receiving email is off), invoices waiting for review, and the last 7 days of emailed outcomes.
 */
export async function inboxFor(contributorId: string, now = new Date()): Promise<Inbox> {
  const prisma = db();
  const inbound = inboundConfig();
  const address = inbound ? addressText((await activeAddress(contributorId)).token, inbound.domain) : null;
  const drafts = await prisma.receipt.findMany({
    where: { contributorId, status: "draft", source: { in: ["einvoice", "einvoice-pdf"] } },
    orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, store: true, purchasedAt: true, source: true, _count: { select: { lines: { where: { kind: "item" } } } } },
  });
  const recent = await prisma.invoiceIntake.findMany({
    where: { contributorId, via: "email", status: { in: ["accepted", "rejected"] }, createdAt: { gt: new Date(now.getTime() - RECENT_DAYS * 86_400_000) } },
    orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, status: true, message: true, store: true, createdAt: true },
  });
  return {
    address,
    drafts: drafts.map((d) => ({ id: d.id, store: STORE_BY_SLUG[d.store], purchasedAt: d.purchasedAt.toISOString(), lines: d._count.lines, source: d.source })),
    recent: recent.map((r) => ({
      id: r.id, status: r.status as InboxOutcome["status"], message: r.message, store: r.store ? STORE_BY_SLUG[r.store] : null, at: r.createdAt.toISOString(),
    })),
  };
}

/** "Cambiar dirección"; null while receiving email is off. */
export async function newAddress(contributorId: string): Promise<string | null> {
  const inbound = inboundConfig();
  return inbound ? addressText((await rotateAddress(contributorId)).token, inbound.domain) : null;
}

/** An intake's overall outcome: accepted when any invoice became a draft, else the first refusal. */
export function summarize(outcomes: IntakeOutcome[]): { status: "accepted" | "rejected"; message: string | null; receiptId: string | null; store: RetailerSlug | null } {
  const accepted = outcomes.find((o) => o.status === "accepted");
  if (accepted && accepted.status === "accepted") {
    const store = (Object.keys(STORE_BY_SLUG) as RetailerSlug[]).find((s) => STORE_BY_SLUG[s] === accepted.draft.store) ?? null;
    return { status: "accepted", message: null, receiptId: accepted.draft.id, store };
  }
  const first = outcomes[0];
  return { status: "rejected", message: first && first.status === "rejected" ? first.message : null, receiptId: null, store: null };
}

/** The per-invoice outcomes kept on the intake row: no prices, no lines. */
export const resultsJson = (outcomes: IntakeOutcome[]) =>
  outcomes.map((o) => (o.status === "accepted" ? { status: o.status, receiptId: o.draft.id, store: o.draft.store } : { status: o.status, code: o.code, message: o.message }));
