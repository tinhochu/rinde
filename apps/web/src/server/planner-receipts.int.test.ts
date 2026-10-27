import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { optimize } from "@rinde/core";
import { db } from "@rinde/db";

// No live store searches: these tests are about which stored prices the planner may use.
vi.mock("./offers", async (orig) => ({ ...(await orig<typeof import("./offers")>()), searchLive: async () => ({ offers: [], failed: [] }) }));

const { candidatesFor } = await import("./candidates");
const { planAndVerify } = await import("./verify");
const { produceListing } = await import("./receipts");
const { cleanupContributors, seedConfirmedReceipt } = await import("./receipt-fixture");

const RUN = `test-planner-${Date.now()}`;

describe.skipIf(!process.env["INTEGRATION"])("planner and receipt prices (dev DB)", () => {
  let jumbo: { id: string; name: string; price: number };

  beforeAll(async () => {
    const papaya = await produceListing(db() as never, "d1", "papaya", "kg");
    await seedConfirmedReceipt({ sessionId: `${RUN}-a`, store: "d1", hoursAgo: 6, lines: [{ listingId: papaya.id, price: 3600, produceSlug: "papaya" }] });
    // A Jumbo product with a current online price, also reported cheaper on a receipt.
    [jumbo] = await db().$queryRaw<{ id: string; name: string; price: number }[]>`
      SELECT DISTINCT ON (rp.id) rp.id, rp.name, po.price FROM "RetailerProduct" rp
      JOIN "Retailer" r ON r.id = rp."retailerId" JOIN "Product" p ON p.id = rp."productId"
      JOIN "PriceObservation" po ON po."retailerProductId" = rp.id
      WHERE r.slug = 'jumbo' AND p.unit = 'g' AND p.size IS NOT NULL AND rp.name ILIKE 'arroz%'
        AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - interval '30 hours'
      ORDER BY rp.id, po."observedAt" DESC LIMIT 1` as [typeof jumbo];
    await seedConfirmedReceipt({ sessionId: `${RUN}-b`, store: "jumbo", hoursAgo: 5, lines: [{ listingId: jumbo.id, price: jumbo.price - 500 }] });
  });
  afterAll(() => cleanupContributors(RUN));

  it("prices papaya at D1 from a receipt, never checks it live, and says so", async () => {
    const item = await candidatesFor({ id: "papaya", label: "1 kg papaya", query: "papaya", brand: null, quantity: 1000, unit: "g", essential: true, allowSubstitute: true }, ["d1"]);
    expect(item.candidates.map((c) => [c.price, c.priceStatus])).toContainEqual([3600, "reported"]);

    const fetchLive = vi.fn(async () => new Map());
    const { plan } = await planAndVerify([{ ...item, candidates: item.candidates.filter((c) => c.priceStatus === "reported") }], { budget: 100_000, retailers: ["d1"] }, { fetchLive });
    const line = plan.stores[0]!.lines[0]!;
    expect(line.candidate).toMatchObject({ price: 3600, priceStatus: "reported" });
    expect(line.reason).toMatch(/Precio reportado en factura hace 6 h; no verificado en línea$/);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it("uses Jumbo's online price even when a receipt reports it cheaper", async () => {
    const item = await candidatesFor({ id: "arroz", label: jumbo.name, query: jumbo.name, brand: null, quantity: 1000, unit: "g", essential: true, allowSubstitute: false }, ["jumbo"]);
    expect(item.candidates.some((c) => c.listingId === jumbo.id && c.priceStatus === "snapshot")).toBe(true);
    expect(item.candidates.some((c) => c.priceStatus === "reported")).toBe(false);
    const line = optimize([item], { budget: 1_000_000, retailers: ["jumbo"] }).stores[0]!.lines[0]!;
    expect(line.candidate.priceStatus).not.toBe("reported");
  });
});
