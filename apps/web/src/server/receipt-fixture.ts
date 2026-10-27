import { randomUUID } from "node:crypto";
import { db, type RetailerSlug } from "@rinde/db";

/**
 * Test helper: a confirmed receipt whose lines are already price observations, as `confirmDraft`
 * would leave them. `hoursAgo` is the purchase time, which is also the observation time.
 */
export async function seedConfirmedReceipt(opts: {
  sessionId: string;
  store: RetailerSlug;
  hoursAgo: number;
  branch?: string;
  lines: { listingId: string; price: number; produceSlug?: string }[];
}) {
  const prisma = db();
  const contributor = await prisma.contributor.upsert({ where: { sessionId: opts.sessionId }, create: { sessionId: opts.sessionId }, update: {} });
  const purchasedAt = new Date(Date.now() - opts.hoursAgo * 3_600_000);
  const unique = randomUUID();
  return prisma.receipt.create({
    data: {
      contributorId: contributor.id, status: "confirmed", store: opts.store, branch: opts.branch ?? "", purchasedAt, confirmedAt: new Date(),
      invoiceNumber: `TEST${unique}`, headerFingerprint: unique, imageHash: unique,
      lines: {
        create: opts.lines.map((l, position) => ({
          position, text: `LINEA ${position}`, check: "ok", accepted: true, unitPrice: l.price, total: l.price,
          retailerProductId: l.listingId, produceSlug: l.produceSlug ?? null,
          observation: { create: { retailerProductId: l.listingId, price: l.price, available: true, source: "community:receipt", sourceUrl: `rinde://receipts/test#${position}`, observedAt: purchasedAt } },
        })),
      },
    },
    include: { lines: true },
  });
}

/** Removes everything seeded for sessions starting with `prefix`, including aliases their receipts taught. */
export async function cleanupContributors(prefix: string) {
  const prisma = db();
  const ids = (await prisma.contributor.findMany({ where: { sessionId: { startsWith: prefix } }, select: { id: true } })).map((c) => c.id);
  const taught = await prisma.receiptLine.findMany({ where: { accepted: true, receipt: { contributorId: { in: ids } } }, select: { text: true, receipt: { select: { store: true } } } });
  for (const l of taught) {
    const text = l.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    await prisma.receiptAlias.deleteMany({ where: { store: l.receipt.store, text } });
  }
  await prisma.priceObservation.deleteMany({ where: { receiptLine: { receipt: { contributorId: { in: ids } } } } });
  await prisma.rewardEvent.deleteMany({ where: { contributorId: { in: ids } } });
  await prisma.contributorBadge.deleteMany({ where: { contributorId: { in: ids } } });
  await prisma.duplicateAttempt.deleteMany({ where: { contributorId: { in: ids } } });
  await prisma.receipt.deleteMany({ where: { contributorId: { in: ids } } });
  await prisma.contributor.deleteMany({ where: { id: { in: ids } } });
}
