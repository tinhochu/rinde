import "server-only";
import type { Prisma, PrismaClient, RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG } from "./contract";
import { ONLINE_PRICE_HOURS, RECEIPT_PRICE_HOURS } from "./offers";

type Tx = Prisma.TransactionClient | PrismaClient;

export const POINTS = { line: 10, bonus: 15 } as const;

export type BadgeId = "primera-factura" | "cazador-de-frutas" | "pionero" | "constante";
export const BADGES: Record<BadgeId, { name: string; description: string; target: number }> = {
  "primera-factura": { name: "Primera factura", description: "Tu primera factura aceptada", target: 1 },
  "cazador-de-frutas": { name: "Cazador de frutas", description: "10 frutas o verduras con precio", target: 10 },
  pionero: { name: "Pionero", description: "5 primeros precios en una tienda", target: 5 },
  constante: { name: "Constante", description: "Facturas en 4 semanas distintas", target: 4 },
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

/** How far the contributor is toward each badge, from ledger and receipt counts (confirmed receipts only). */
export async function badgeProgress(tx: Tx, contributorId: string): Promise<Record<BadgeId, number>> {
  const accepted = await tx.receipt.findMany({ where: { contributorId, status: "confirmed" }, select: { purchasedAt: true } });
  const produce = await tx.receiptLine.count({ where: { accepted: true, produceSlug: { not: null }, receipt: { contributorId, status: "confirmed" } } });
  const gaps = await tx.rewardEvent.count({ where: { contributorId, kind: "gap_bonus", receipt: { status: "confirmed" } } });
  const weeks = new Set(accepted.map((r) => weekStart(r.purchasedAt).getTime())).size;
  return { "primera-factura": accepted.length, "cazador-de-frutas": produce, pionero: gaps, constante: weeks };
}

/** Which badges the contributor qualifies for now. */
export async function qualifyingBadges(tx: Tx, contributorId: string): Promise<BadgeId[]> {
  const progress = await badgeProgress(tx, contributorId);
  return (Object.keys(BADGES) as BadgeId[]).filter((id) => progress[id] >= BADGES[id].target);
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

/** "Vecino #K3F9Q" unless the contributor picked a name; never anything read from a receipt. */
export const publicName = (c: { id: string; displayName: string | null }) => c.displayName || `Vecino #${c.id.slice(-5).toUpperCase()}`;

export type LeaderboardRow = { rank: number; name: string; points: number; you: boolean };
export type Leaderboard = { zone: string; weekStart: string; top: LeaderboardRow[]; you: LeaderboardRow | null };

/** Points earned this week (Monday 00:00 Colombia time onward) by contributors in `zone`, highest first. */
export async function leaderboard(tx: Tx, zone: string, opts: { contributorId?: string; now?: Date } = {}): Promise<Leaderboard> {
  const start = weekStart(opts.now ?? new Date());
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const sums = await tx.rewardEvent.groupBy({
    by: ["contributorId"],
    where: { createdAt: { gte: start, lt: end }, contributor: { zone } },
    _sum: { points: true },
  });
  const ranked = sums
    .map((s) => ({ contributorId: s.contributorId, points: s._sum.points ?? 0 }))
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points || a.contributorId.localeCompare(b.contributorId));
  const people = new Map((await tx.contributor.findMany({
    where: { id: { in: ranked.map((r) => r.contributorId) } }, select: { id: true, displayName: true },
  })).map((c) => [c.id, c]));
  const rows = ranked.map((r, i): LeaderboardRow => ({
    rank: i + 1, name: publicName(people.get(r.contributorId)!), points: r.points, you: r.contributorId === opts.contributorId,
  }));
  return { zone, weekStart: start.toISOString(), top: rows.slice(0, 10), you: rows.find((r) => r.you) ?? null };
}

/** draft: read but never sent; confirmed: its accepted prices count; revoked: annulled later (reason from the ledger). */
export type ReceiptSummary = {
  id: string; store: string; purchasedAt: string; status: "draft" | "confirmed" | "revoked";
  acceptedLines: number; points: number; reason: string | null;
};

export type MyRewards = {
  points: number;
  name: string;
  zone: string;
  badges: { id: BadgeId; name: string; description: string; earnedAt: string }[];
  /** Every badge with its rule and progress, earned or not */
  achievements: { id: BadgeId; name: string; description: string; target: number; progress: number; earnedAt: string | null }[];
  /** Counts from receipt records: confirmed receipts and the prices accepted on them */
  receipts: { confirmed: number; revoked: number; prices: number };
  recentReceipts: ReceiptSummary[];
  history: { label: string; points: number; at: string }[];
  rank: LeaderboardRow | null;
};

export const emptyRewards = (): MyRewards => ({
  points: 0, name: "", zone: "", badges: [],
  achievements: (Object.keys(BADGES) as BadgeId[]).map((id) => ({ id, ...BADGES[id], progress: 0, earnedAt: null })),
  receipts: { confirmed: 0, revoked: 0, prices: 0 }, recentReceipts: [], history: [], rank: null,
});

/** Balance, badges, recent ledger entries and this week's rank for a session; empty before the first receipt. */
export async function rewardsFor(tx: Tx, sessionId: string, now = new Date()): Promise<MyRewards | null> {
  const c = await tx.contributor.findUnique({ where: { sessionId }, include: { badges: { orderBy: { earnedAt: "asc" } } } });
  if (!c) return null;
  const points = (await tx.rewardEvent.aggregate({ where: { contributorId: c.id }, _sum: { points: true } }))._sum.points ?? 0;
  const events = await tx.rewardEvent.findMany({ where: { contributorId: c.id }, orderBy: { createdAt: "desc" }, take: 30, select: { label: true, points: true, createdAt: true } });
  const board = await leaderboard(tx, c.zone, { contributorId: c.id, now });
  const progress = await badgeProgress(tx, c.id);
  const earned = new Map(c.badges.map((b) => [b.badge, b.earnedAt.toISOString()]));
  const counts = await tx.receipt.groupBy({ by: ["status"], where: { contributorId: c.id }, _count: true });
  const count = (status: string) => counts.find((r) => r.status === status)?._count ?? 0;
  const prices = await tx.receiptLine.count({ where: { accepted: true, receipt: { contributorId: c.id, status: "confirmed" } } });
  const recent = await tx.receipt.findMany({
    where: { contributorId: c.id }, orderBy: { createdAt: "desc" }, take: 10,
    select: {
      id: true, store: true, purchasedAt: true, status: true,
      _count: { select: { lines: { where: { accepted: true } } } },
      rewards: { select: { points: true, kind: true, label: true } },
    },
  });
  return {
    points,
    name: publicName(c),
    zone: c.zone,
    badges: c.badges.map((b) => ({ id: b.badge as BadgeId, name: BADGES[b.badge as BadgeId].name, description: BADGES[b.badge as BadgeId].description, earnedAt: b.earnedAt.toISOString() })),
    achievements: (Object.keys(BADGES) as BadgeId[]).map((id) => ({
      id, ...BADGES[id], progress: Math.min(progress[id], BADGES[id].target), earnedAt: earned.get(id) ?? null,
    })),
    receipts: { confirmed: count("confirmed"), revoked: count("revoked"), prices },
    recentReceipts: recent.map((r) => ({
      id: r.id,
      store: STORE_BY_SLUG[r.store],
      purchasedAt: r.purchasedAt.toISOString(),
      status: r.status as ReceiptSummary["status"],
      acceptedLines: r.status === "draft" ? 0 : r._count.lines,
      points: r.rewards.reduce((sum, e) => sum + e.points, 0),
      // revokeReceipt labels its entry "<reason>: −N"; the reason is all a person needs.
      reason: r.rewards.find((e) => e.kind === "revoked")?.label.replace(/:\s*−\d+$/, "") ?? null,
    })),
    history: events.map((e) => ({ label: e.label, points: e.points, at: e.createdAt.toISOString() })),
    rank: board.you,
  };
}

/**
 * Moves everything a device session earned onto another contributor (for the sign-in hook): ledger
 * entries and receipts change owner, so balances add up; a badge held by both keeps its earliest date.
 */
export async function mergeContributors(tx: Prisma.TransactionClient, fromId: string, intoId: string) {
  if (fromId === intoId) return;
  await tx.rewardEvent.updateMany({ where: { contributorId: fromId }, data: { contributorId: intoId } });
  await tx.receipt.updateMany({ where: { contributorId: fromId }, data: { contributorId: intoId } });
  await tx.duplicateAttempt.updateMany({ where: { contributorId: fromId }, data: { contributorId: intoId } });
  // Both forwarding addresses keep delivering to the merged contributor.
  await tx.forwardingAddress.updateMany({ where: { contributorId: fromId }, data: { contributorId: intoId } });
  await tx.invoiceIntake.updateMany({ where: { contributorId: fromId }, data: { contributorId: intoId } });
  const held = new Map((await tx.contributorBadge.findMany({ where: { contributorId: intoId } })).map((b) => [b.badge, b]));
  for (const b of await tx.contributorBadge.findMany({ where: { contributorId: fromId } })) {
    const mine = held.get(b.badge);
    if (!mine) await tx.contributorBadge.create({ data: { contributorId: intoId, badge: b.badge, earnedAt: b.earnedAt } });
    else if (b.earnedAt < mine.earnedAt) await tx.contributorBadge.update({ where: { contributorId_badge: { contributorId: intoId, badge: b.badge } }, data: { earnedAt: b.earnedAt } });
  }
  await tx.contributorBadge.deleteMany({ where: { contributorId: fromId } });
  await tx.contributor.delete({ where: { id: fromId } });
  await syncBadges(tx, intoId);
}
