// Receipt retention (receipt-capture spec): drafts are discarded after 24 h; photos are deleted
// after 30 days (the receipt row and its image hash stay, so the duplicate guardrail still works).
import { rm } from "node:fs/promises";
import { db } from "@rinde/db";

const DRAFT_TTL_MS = 24 * 3_600_000;
const IMAGE_TTL_MS = 30 * 24 * 3_600_000;

export async function cleanupReceipts(now = new Date()) {
  const prisma = db();
  const drafts = await prisma.receipt.findMany({
    where: { status: "draft", createdAt: { lt: new Date(now.getTime() - DRAFT_TTL_MS) } },
    select: { id: true, imagePath: true },
  });
  for (const d of drafts) if (d.imagePath) await rm(d.imagePath, { force: true });
  await prisma.receipt.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } });

  const old = await prisma.receipt.findMany({
    where: { status: { not: "draft" }, imagePath: { not: null }, createdAt: { lt: new Date(now.getTime() - IMAGE_TTL_MS) } },
    select: { id: true, imagePath: true },
  });
  for (const r of old) await rm(r.imagePath!, { force: true });
  await prisma.receipt.updateMany({ where: { id: { in: old.map((r) => r.id) } }, data: { imagePath: null } });

  return { drafts: drafts.length, images: old.length };
}
