import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@rinde/db";

vi.mock("./offers", async (orig) => ({
  ...(await orig<typeof import("./offers")>()),
  lookupMissingEans: async (_e: string[], stores: string[]) => ({ found: [], answered: new Set(stores), reasons: [] }),
}));
const { basicsFor } = await import("./basics");
const { cleanupContributors, seedConfirmedReceipt } = await import("./receipt-fixture");

const RUN = `test-basics-${Date.now()}`;

describe.skipIf(!process.env["INTEGRATION"])("a person's basics (dev DB)", () => {
  afterAll(() => cleanupContributors(RUN));

  it("puts what their receipts show they buy most first, then what they picked from search, once each", async () => {
    const listings = await db().$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (rp."productId") rp.id FROM "RetailerProduct" rp
      JOIN "Retailer" r ON r.id = rp."retailerId" JOIN "PriceObservation" po ON po."retailerProductId" = rp.id
      WHERE r.slug = 'jumbo' AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - interval '30 hours'
      LIMIT 3`;
    const [often, once, searched] = listings.map((l) => l.id) as [string, string, string];
    const sessionId = `${RUN}-a`;
    await seedConfirmedReceipt({ sessionId, store: "jumbo", hoursAgo: 30, lines: [{ listingId: often, price: 1000 }, { listingId: once, price: 1000 }] });
    await seedConfirmedReceipt({ sessionId, store: "jumbo", hoursAgo: 2, lines: [{ listingId: often, price: 1000 }] });

    const basics = await basicsFor(sessionId, { ids: [searched, often] }, ["d1", "jumbo"]);
    expect(basics.map((b) => [b.id, b.source, b.times])).toEqual([[often, "receipt", 2], [once, "receipt", 1], [searched, "search", 1]]);
    expect(basics.every((b) => b.offers.length > 0)).toBe(true);
  });

  it("is empty for someone new", async () => {
    expect(await basicsFor(`${RUN}-new`, { ids: [] }, ["d1", "jumbo"])).toEqual([]);
  });
});
