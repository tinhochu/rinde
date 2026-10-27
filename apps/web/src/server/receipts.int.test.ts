import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Extraction, ExtractedLine } from "@rinde/core";
import { db } from "@rinde/db";

// The model is mocked: these tests cover our checks, matching and guardrail, not Muse.
const muse = vi.hoisted(() => ({ extraction: null as Extraction | null, calls: 0, down: false }));
vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return {
    ...actual,
    extractReceipt: async () => {
      muse.calls++;
      if (muse.down) throw new actual.MuseUnavailable("mocked outage");
      return { extraction: structuredClone(muse.extraction!), demo: false };
    },
    chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); },
  };
});
vi.stubEnv("RECEIPTS_DIR", "/tmp/rinde-receipts-test");

const { createDraft, confirmDraft, MESSAGES } = await import("./receipts");

const RUN = `test-${Date.now()}`;
const session = (n: string) => `${RUN}-${n}`;
let seq = 0;
let minute = 0;
const image = () => new TextEncoder().encode(`${RUN}-image-${++seq}`);

/** "26/10/2026 14:32" for a time `hoursAgo` before now, in Colombia time. */
function printed(hoursAgo: number) {
  // Each receipt gets its own minute, so different test receipts never share a header.
  const d = new Date(Date.now() - hoursAgo * 3_600_000 - ++minute * 60_000 - 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

let jumbo: { ean: string; name: string }[] = [];
let second: Extraction;

function receipt(invoice: string, extra: Partial<Extraction> = {}): Extraction {
  const lines: ExtractedLine[] = jumbo.slice(0, 9).map((p) => ({ kind: "item", text: p.name.toUpperCase().slice(0, 24), code: p.ean, quantity: "1", unit_price: "5.000", total: "5.000" }));
  lines.push({ kind: "item", text: "BOLSA PLASTICA", code: "", quantity: "1", unit_price: "66", total: "66" });
  lines.push({ kind: "item", text: "DONACION", code: "", quantity: "1", unit_price: "100", total: "100" });
  lines.push({ kind: "item", text: "ZZZ PRODUCTO RARO", code: "", quantity: "1", unit_price: "1.000", total: "1.000" });
  return { store: "CENCOSUD COLOMBIA S.A. - JUMBO", branch: `Jumbo ${RUN}`, purchased_at: printed(2), total: "46.166", invoice_number: invoice, cufe: "", lines, ...extra };
}

describe.skipIf(!process.env["INTEGRATION"])("receipts (dev DB)", () => {
  beforeAll(async () => {
    // Jumbo listings with a barcode and a current online price, so lines match by code and aren't gaps.
    jumbo = await db().$queryRaw<{ ean: string; name: string }[]>`
      SELECT DISTINCT ON (p.ean) p.ean, rp.name FROM "RetailerProduct" rp
      JOIN "Retailer" r ON r.id = rp."retailerId" JOIN "Product" p ON p.id = rp."productId"
      JOIN "PriceObservation" po ON po."retailerProductId" = rp.id
      WHERE r.slug = 'jumbo' AND length(p.ean) >= 8 AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - interval '30 hours'
      LIMIT 9`;
    expect(jumbo).toHaveLength(9);
    second = receipt(`POS ${RUN}-2`);
  });
  beforeEach(() => { muse.calls = 0; muse.down = false; });

  afterAll(async () => {
    const prisma = db();
    const contributors = await prisma.contributor.findMany({ where: { sessionId: { startsWith: RUN } }, select: { id: true } });
    const ids = contributors.map((c) => c.id);
    await prisma.priceObservation.deleteMany({ where: { receiptLine: { receipt: { contributorId: { in: ids } } } } });
    await prisma.rewardEvent.deleteMany({ where: { contributorId: { in: ids } } });
    await prisma.contributorBadge.deleteMany({ where: { contributorId: { in: ids } } });
    await prisma.duplicateAttempt.deleteMany({ where: { contributorId: { in: ids } } });
    await prisma.receipt.deleteMany({ where: { contributorId: { in: ids } } });
    await prisma.contributor.deleteMany({ where: { id: { in: ids } } });
  });

  it("drafts a receipt, then confirms 9 of 12 lines into 9 observations and 90 points", async () => {
    muse.extraction = receipt(`POS ${RUN}-1`);
    const draft = await createDraft({ sessionId: session("a"), image: image(), mime: "image/jpeg" });
    expect(draft.store).toBe("Jumbo");
    expect(draft.lines.slice(0, 9).every((l) => l.match?.by === "ean")).toBe(true);

    const result = await confirmDraft({
      sessionId: session("a"), receiptId: draft.id,
      edits: [{ index: 9, excluded: true }, { index: 10, excluded: true }, { index: 11, noMatch: true }],
    });
    expect(result).toMatchObject({ points: 90, acceptedLines: 9 });
    expect(result.badges.map((b) => b.id)).toContain("primera-factura");
    const observations = await db().priceObservation.count({ where: { receiptLine: { receiptId: draft.id } } });
    expect(observations).toBe(9);
  });

  it("proposes Arroz Diana for an abbreviated line and records weighed banana per kg", async () => {
    muse.extraction = receipt(`POS ${RUN}-match`, {
      lines: [
        { kind: "item", text: "ARZ DIANA 1KG", code: "", quantity: "1", unit_price: "4.890", total: "4.890" },
        { kind: "item", text: "BANANO URABA", code: "", quantity: "0,845 KG", unit_price: "3.980", total: "3.363" },
      ],
      total: "8.253",
    });
    const draft = await createDraft({ sessionId: session("m"), image: image(), mime: "image/jpeg" });
    expect(draft.lines[0]!.match).toMatchObject({ by: "search" });
    expect(draft.lines[0]!.match!.name).toMatch(/arroz diana/i);
    expect(draft.lines[1]!.match).toMatchObject({ by: "produce", produce: { slug: "banano", unit: "kg" } });
    expect(draft.reconciliation.difference).toBe(0);

    await confirmDraft({ sessionId: session("m"), receiptId: draft.id, edits: [] });
    const banana = await db().priceObservation.findFirstOrThrow({
      where: { receiptLine: { receiptId: draft.id, position: 1 } },
      select: { price: true, source: true, retailerProduct: { select: { externalId: true } } },
    });
    expect(banana).toEqual({ price: 3980, source: "community:receipt", retailerProduct: { externalId: "produce:banano:kg" } });
  });

  it("rejects the same receipt from another person at the draft stage", async () => {
    muse.extraction = receipt(`POS ${RUN}-1`);
    await expect(createDraft({ sessionId: session("b"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.duplicate);
  });

  it("rejects the exact same file without calling the model", async () => {
    const file = image();
    muse.extraction = second;
    const draft = await createDraft({ sessionId: session("c"), image: file, mime: "image/jpeg" });
    await confirmDraft({ sessionId: session("c"), receiptId: draft.id, edits: [] });
    muse.calls = 0;
    await expect(createDraft({ sessionId: session("d"), image: file, mime: "image/jpeg" })).rejects.toThrow(MESSAGES.duplicate);
    expect(muse.calls).toBe(0);
  });

  it("rejects a retake whose invoice number is misread but whose header matches", async () => {
    // Same store, branch, minute and total as the receipt accepted in the previous test.
    muse.extraction = { ...second, invoice_number: `POS ${RUN}-2-MISREAD` };
    await expect(createDraft({ sessionId: session("e"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.duplicate);
    expect(await db().duplicateAttempt.findFirst({ where: { contributor: { sessionId: session("e") } }, select: { layer: true } })).toEqual({ layer: "header" });
  });

  it("accepts exactly one of two concurrent confirms of the same receipt", async () => {
    muse.extraction = receipt(`POS ${RUN}-3`);
    const invoice3 = `POS ${RUN}-3`.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const one = await createDraft({ sessionId: session("f"), image: image(), mime: "image/jpeg" });
    const two = await createDraft({ sessionId: session("g"), image: image(), mime: "image/jpeg" });
    const results = await Promise.allSettled([
      confirmDraft({ sessionId: session("f"), receiptId: one.id, edits: [] }),
      confirmDraft({ sessionId: session("g"), receiptId: two.id, edits: [] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toBe(MESSAGES.duplicate);
    const accepted = await db().receipt.count({ where: { invoiceNumber: invoice3, status: "confirmed" } });
    expect(accepted).toBe(1);
    const events = await db().rewardEvent.count({ where: { receipt: { invoiceNumber: invoice3 } } });
    // One set of points: the winner's lines only (unmatched lines may be proposed from search here).
    const winner = (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ acceptedLines: number }>).value;
    expect(events).toBe(winner.acceptedLines);
  });

  it("pauses a session after its third duplicate", async () => {
    muse.extraction = receipt(`POS ${RUN}-1`);
    for (let i = 0; i < 3; i++) {
      await expect(createDraft({ sessionId: session("h"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.duplicate);
    }
    muse.extraction = receipt(`POS ${RUN}-NEW`);
    await expect(createDraft({ sessionId: session("h"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.paused);
    expect(await db().duplicateAttempt.count({ where: { contributor: { sessionId: session("h") } } })).toBe(3);
  });

  it("refuses other stores, old receipts and unreadable invoice numbers", async () => {
    muse.extraction = receipt(`POS ${RUN}-4`, { store: "CARULLA - ALMACENES EXITO S.A.", branch: "Carulla" });
    await expect(createDraft({ sessionId: session("i"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.store);
    muse.extraction = receipt(`POS ${RUN}-5`, { purchased_at: printed(96) });
    await expect(createDraft({ sessionId: session("i"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.old);
    muse.extraction = receipt("", {});
    await expect(createDraft({ sessionId: session("i"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.invoice);
    muse.extraction = receipt(`POS ${RUN}-6`, { purchased_at: printed(-3) });
    await expect(createDraft({ sessionId: session("i"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.future);
  });

  it("says reading is unavailable when the model is down, storing nothing", async () => {
    muse.down = true;
    await expect(createDraft({ sessionId: session("j"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.unavailable);
    expect(await db().receipt.count({ where: { contributor: { sessionId: session("j") } } })).toBe(0);
  });

  it("accepts at most 5 receipts per contributor per day", async () => {
    for (let i = 0; i < 5; i++) {
      muse.extraction = receipt(`POS ${RUN}-cap-${i}`);
      const draft = await createDraft({ sessionId: session("k"), image: image(), mime: "image/jpeg" });
      await confirmDraft({ sessionId: session("k"), receiptId: draft.id, edits: [] });
    }
    muse.extraction = receipt(`POS ${RUN}-cap-5`);
    await expect(createDraft({ sessionId: session("k"), image: image(), mime: "image/jpeg" })).rejects.toThrow(MESSAGES.cap);
  });
});
