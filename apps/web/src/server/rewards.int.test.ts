import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@rinde/core";
import { db, ensureRetailer } from "@rinde/db";

const muse = vi.hoisted(() => ({ extraction: null as Extraction | null }));
vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return {
    ...actual,
    extractReceipt: async () => ({ extraction: structuredClone(muse.extraction!), demo: false }),
    chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); },
  };
});
vi.stubEnv("RECEIPTS_DIR", "/tmp/rinde-receipts-test");

const { createDraft, confirmDraft } = await import("./receipts");
const { leaderboard, mergeContributors, revokeReceipt, syncBadges, rewardsFor } = await import("./rewards");
const { cleanupContributors, seedConfirmedReceipt } = await import("./receipt-fixture");

const RUN = `test-rewards-${Date.now()}`;
const EAN = `99${Date.now()}`.slice(0, 13);
const prisma = db();

async function contributor(name: string, zone = `Zona ${RUN}`) {
  return prisma.contributor.create({ data: { sessionId: `${RUN}-${name}`, zone } });
}
const event = (contributorId: string, points: number, createdAt: Date, kind = "line") =>
  prisma.rewardEvent.create({ data: { contributorId, kind, points, label: "Precio confirmado", createdAt } });

describe.skipIf(!process.env["INTEGRATION"])("rewards (dev DB)", () => {
  let productId: string;
  beforeAll(async () => {
    // An Éxito product nobody has priced: its first receipt price fills a gap.
    const exito = await ensureRetailer(prisma, "exito");
    const product = await prisma.product.create({ data: { name: "Producto de prueba", ean: EAN, size: 500, unit: "g" } });
    productId = product.id;
    await prisma.retailerProduct.create({ data: { retailerId: exito.id, productId, externalId: `test-${RUN}`, name: "Producto de prueba 500 g", url: "https://www.exito.com", lastSeenAt: new Date() } });
  });
  afterAll(async () => {
    await cleanupContributors(RUN);
    await prisma.retailerProduct.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it("pays 25 points for a first Éxito price, labeled as such", async () => {
    const now = new Date();
    const d = new Date(now.getTime() - 2 * 3_600_000 - 5 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    muse.extraction = {
      store: "ALMACENES EXITO S.A.", branch: `Éxito ${RUN}`, total: "8.900", invoice_number: `POS ${RUN}`, cufe: "",
      purchased_at: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
      lines: [{ kind: "item", text: "PRODUCTO PRUEBA 500G", code: EAN, quantity: "1", unit_price: "8.900", total: "8.900" }],
    };
    const draft = await createDraft({ sessionId: `${RUN}-gap`, image: new TextEncoder().encode(RUN), mime: "image/jpeg" });
    const result = await confirmDraft({ sessionId: `${RUN}-gap`, receiptId: draft.id, edits: [] });
    expect(result.points).toBe(25);
    expect(result.breakdown).toContainEqual({ label: "Primer precio en Éxito", points: 15, lines: 1 });
  });

  it("grants each badge at its threshold, once", async () => {
    const c = await contributor("badges");
    const listing = await prisma.retailerProduct.findFirstOrThrow({ where: { productId } });
    const seed = (hoursAgo: number, produce: number) => seedConfirmedReceipt({
      sessionId: c.sessionId, store: "exito", hoursAgo,
      lines: Array.from({ length: Math.max(produce, 1) }, () => ({ listingId: listing.id, price: 1000, ...(produce ? { produceSlug: "banano" } : {}) })),
    });
    await seed(1, 9);
    expect(await syncBadges(prisma, c.id)).toEqual(["primera-factura"]);
    await seed(2, 1);
    expect(await syncBadges(prisma, c.id)).toEqual(["cazador-de-frutas"]);
    const receipt = await prisma.receipt.findFirstOrThrow({ where: { contributorId: c.id } });
    for (let i = 0; i < 4; i++) await prisma.rewardEvent.create({ data: { contributorId: c.id, receiptId: receipt.id, kind: "gap_bonus", points: 15, label: "Primer precio en Éxito" } });
    expect(await syncBadges(prisma, c.id)).toEqual([]);
    await prisma.rewardEvent.create({ data: { contributorId: c.id, receiptId: receipt.id, kind: "gap_bonus", points: 15, label: "Primer precio en Éxito" } });
    expect(await syncBadges(prisma, c.id)).toEqual(["pionero"]);
    await seed(24 * 7, 0);
    await seed(24 * 14, 0);
    expect(await syncBadges(prisma, c.id)).toEqual([]);
    await seed(24 * 21, 0);
    expect(await syncBadges(prisma, c.id)).toEqual(["constante"]);
    expect(await syncBadges(prisma, c.id)).toEqual([]);
    expect(await prisma.contributorBadge.count({ where: { contributorId: c.id } })).toBe(4);
  });

  it("ranks this week only, from Monday 00:00 Colombia time, and shows your own place outside the top 10", async () => {
    // Monday 26 Oct 2026, 10:00 Bogotá. Sunday 23:30 belongs to the previous week.
    const now = new Date("2026-10-26T15:00:00Z");
    const sunday = new Date("2026-10-26T04:30:00Z");
    const monday = new Date("2026-10-26T05:30:00Z");
    const zone = `Ranking ${RUN}`;
    const me = await contributor("me", zone);
    await event(me.id, 500, sunday);
    await event(me.id, 30, monday);
    for (let i = 0; i < 11; i++) await event((await contributor(`n${i}`, zone)).id, 100 + i, monday);
    await event((await contributor("elsewhere", `Otra ${RUN}`)).id, 999, monday);

    const board = await leaderboard(prisma, zone, { contributorId: me.id, now });
    expect(board.top).toHaveLength(10);
    expect(board.top[0]).toMatchObject({ rank: 1, points: 110, you: false });
    expect(board.top[0]!.name).toMatch(/^Vecino #[A-Z0-9]{5}$/);
    expect(board.you).toMatchObject({ rank: 12, points: 30, you: true });
  });

  it("revokes a duplicate's 120 points and merges a device's 340 points into an account", async () => {
    const device = await contributor("device");
    const listing = await prisma.retailerProduct.findFirstOrThrow({ where: { productId } });
    const receipt = await seedConfirmedReceipt({ sessionId: device.sessionId, store: "exito", hoursAgo: 1, lines: [{ listingId: listing.id, price: 1000 }] });
    await prisma.rewardEvent.create({ data: { contributorId: device.id, receiptId: receipt.id, kind: "line", points: 120, label: "Precio confirmado" } });
    await syncBadges(prisma, device.id);
    expect(await revokeReceipt(prisma, receipt.id, "Factura duplicada")).toBe(120);
    const after = await rewardsFor(prisma, device.sessionId);
    expect(after).toMatchObject({ points: 0, badges: [] });
    expect(after!.history[0]).toMatchObject({ label: "Factura duplicada: −120", points: -120 });

    const kept = await seedConfirmedReceipt({ sessionId: device.sessionId, store: "exito", hoursAgo: 2, lines: [{ listingId: listing.id, price: 1000 }] });
    await prisma.rewardEvent.create({ data: { contributorId: device.id, receiptId: kept.id, kind: "line", points: 340, label: "Precio confirmado" } });
    await syncBadges(prisma, device.id);
    const account = await contributor("account");
    await prisma.$transaction((tx) => mergeContributors(tx, device.id, account.id));
    const merged = await rewardsFor(prisma, account.sessionId);
    expect(merged!.points).toBe(340);
    expect(merged!.badges.map((b) => b.id)).toEqual(["primera-factura"]);
    expect(await prisma.contributor.findUnique({ where: { id: device.id } })).toBeNull();
  });
});
