import "server-only";
import type { Prisma, PrismaClient, RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG } from "./contract";

type Tx = Prisma.TransactionClient | PrismaClient;

export const POINTS = { line: 10, bonus: 15 } as const;
/** How long a receipt price counts as current (community-prices spec). */
export const RECEIPT_PRICE_HOURS = 72;
/** Online snapshot prices count as current this long (plan-price-verification spec). */
export const ONLINE_PRICE_HOURS = 36;

export type BadgeId = "primera-factura" | "cazador-de-frutas" | "pionero" | "constante";
export const BADGES: Record<BadgeId, { name: string; description: string }> = {
  "primera-factura": { name: "Primera factura", description: "Tu primera factura aceptada" },
  "cazador-de-frutas": { name: "Cazador de frutas", description: "10 frutas o verduras con precio" },
  pionero: { name: "Pionero", description: "5 primeros precios en una tienda" },
  constante: { name: "Constante", description: "Facturas en 4 semanas distintas" },
};

/** True when the listing has no current online price and no current receipt price (excluding this receipt). */
export async function isGap(tx: Tx, listingId: string, receiptId: string, now: Date): Promise<boolean> {
  const online = await tx.priceObservation.count({
    where: {
      retailerProductId: listingId, available: true, NOT: { source: { startsWith: "community:" } },
      observedAt: { gt: new Date(now.getTime() - ONLINE_PRICE_HOURS * 3_600_000) },
    },
  });
  if (online > 0) return false;
  const reported = await tx.priceObservation.count({
    where: {
      retailerProductId: listingId, source: "community:receipt",
      observedAt: { gt: new Date(now.getTime() - RECEIPT_PRICE_HOURS * 3_600_000) },
      receiptLine: { receiptId: { not: receiptId }, receipt: { status: "confirmed" } },
    },
  });
  return reported === 0;
}

export type LineReward = { lineId: string; produce: boolean; gap: boolean };

/** 10 points per accepted line, plus one 15-point bonus for a gap or a produce line. */
export async function awardLines(tx: Tx, contributorId: string, receiptId: string, store: RetailerSlug, lines: LineReward[]) {
  const events: Prisma.RewardEventCreateManyInput[] = [];
  for (const l of lines) {
    events.push({ contributorId, receiptId, receiptLineId: l.lineId, kind: "line", points: POINTS.line, label: "Precio confirmado" });
    if (l.gap) events.push({ contributorId, receiptId, receiptLineId: l.lineId, kind: "gap_bonus", points: POINTS.bonus, label: `Primer precio en ${STORE_BY_SLUG[store]}` });
    else if (l.produce) events.push({ contributorId, receiptId, receiptLineId: l.lineId, kind: "produce_bonus", points: POINTS.bonus, label: "Fruta o verdura" });
  }
  if (events.length) await tx.rewardEvent.createMany({ data: events });
  return events;
}

/** Monday 00:00 America/Bogota (UTC−5, no DST) of the week containing `at`. */
export function weekStart(at: Date): Date {
  const local = new Date(at.getTime() - 5 * 3_600_000);
  const day = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day);
  return new Date(monday + 5 * 3_600_000);
}

/** Which badges the contributor qualifies for now, from ledger and receipt counts. */
export async function qualifyingBadges(tx: Tx, contributorId: string): Promise<BadgeId[]> {
  const accepted = await tx.receipt.findMany({ where: { contributorId, status: "confirmed" }, select: { purchasedAt: true } });
  const produce = await tx.receiptLine.count({ where: { accepted: true, produceSlug: { not: null }, receipt: { contributorId, status: "confirmed" } } });
  const gaps = await tx.rewardEvent.count({ where: { contributorId, kind: "gap_bonus", receipt: { status: "confirmed" } } });
  const weeks = new Set(accepted.map((r) => weekStart(r.purchasedAt).getTime())).size;
  const out: BadgeId[] = [];
  if (accepted.length >= 1) out.push("primera-factura");
  if (produce >= 10) out.push("cazador-de-frutas");
  if (gaps >= 5) out.push("pionero");
  if (weeks >= 4) out.push("constante");
  return out;
}

/** Grants newly earned badges (each once) and removes ones that no longer qualify. Returns the new ones. */
export async function syncBadges(tx: Tx, contributorId: string): Promise<BadgeId[]> {
  const qualifying = await qualifyingBadges(tx, contributorId);
  const held = new Set((await tx.contributorBadge.findMany({ where: { contributorId }, select: { badge: true } })).map((b) => b.badge));
  const earned = qualifying.filter((b) => !held.has(b));
  if (earned.length) await tx.contributorBadge.createMany({ data: earned.map((badge) => ({ contributorId, badge })) });
  const lost = [...held].filter((b) => !qualifying.includes(b as BadgeId));
  if (lost.length) await tx.contributorBadge.deleteMany({ where: { contributorId, badge: { in: lost } } });
  return earned;
}

/**
 * Revokes a receipt: a negative ledger entry for its points and badges re-checked. Its price
 * observations stay (append-only) but stop being shown, since community reads require a confirmed receipt.
 */
export async function revokeReceipt(tx: Tx, receiptId: string, reason: string) {
  const receipt = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, select: { contributorId: true, status: true } });
  if (receipt.status === "revoked") return 0;
  const sum = (await tx.rewardEvent.aggregate({ where: { receiptId }, _sum: { points: true } }))._sum.points ?? 0;
  await tx.receipt.update({ where: { id: receiptId }, data: { status: "revoked" } });
  if (sum !== 0) {
    await tx.rewardEvent.create({ data: { contributorId: receipt.contributorId, receiptId, kind: "revoked", points: -sum, label: `${reason}: −${sum}` } });
  }
  await syncBadges(tx, receipt.contributorId);
  return sum;
}
