import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import { cleanupReceipts } from "./cleanup";

// Runs against the dev database: INTEGRATION=1 pnpm --filter @rinde/worker test
describe.skipIf(!process.env["INTEGRATION"])("cleanupReceipts (dev DB)", () => {
  const session = `test-cleanup-${Date.now()}`;
  afterAll(async () => {
    await db().receipt.deleteMany({ where: { contributor: { sessionId: session } } });
    await db().contributor.deleteMany({ where: { sessionId: session } });
  });

  it("removes stale drafts and 30-day-old photos, keeping accepted receipts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "receipts-"));
    const file = async (name: string) => { const f = path.join(dir, name); await writeFile(f, "x"); return f; };
    const exists = (f: string) => stat(f).then(() => true, () => false);
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const contributor = await db().contributor.create({ data: { sessionId: session } });
    const base = { contributorId: contributor.id, store: "jumbo" as const, purchasedAt: now, invoiceNumber: "x", headerFingerprint: "x" };

    const staleDraft = await db().receipt.create({ data: { ...base, status: "draft", imageHash: `${session}-1`, imagePath: await file("a.img"), createdAt: daysAgo(2) } });
    const freshDraft = await db().receipt.create({ data: { ...base, status: "draft", imageHash: `${session}-2`, imagePath: await file("b.img") } });
    const oldAccepted = await db().receipt.create({ data: { ...base, status: "confirmed", invoiceNumber: `${session}-3`, headerFingerprint: `${session}-3`, imageHash: `${session}-3`, imagePath: await file("c.img"), createdAt: daysAgo(31) } });

    await cleanupReceipts(now);

    expect(await db().receipt.findUnique({ where: { id: staleDraft.id } })).toBeNull();
    expect(await exists(path.join(dir, "a.img"))).toBe(false);
    expect(await db().receipt.findUnique({ where: { id: freshDraft.id } })).not.toBeNull();
    expect(await exists(path.join(dir, "b.img"))).toBe(true);
    const kept = await db().receipt.findUniqueOrThrow({ where: { id: oldAccepted.id } });
    expect(kept).toMatchObject({ status: "confirmed", imagePath: null, imageHash: `${session}-3` });
    expect(await exists(path.join(dir, "c.img"))).toBe(false);
  });
});
