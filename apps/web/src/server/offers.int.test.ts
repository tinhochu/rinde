import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import { listingsByEan, searchListings } from "./offers";
import { cleanupContributors, seedConfirmedReceipt } from "./receipt-fixture";

const RUN = `test-offers-${Date.now()}`;

describe.skipIf(!process.env["INTEGRATION"])("online and receipt reads (dev DB)", () => {
  let fresh: { id: string; ean: string; name: string };
  let stale: { id: string; ean: string; name: string };

  beforeAll(async () => {
    // Two Jumbo listings that have a current online price.
    [fresh, stale] = await db().$queryRaw<{ id: string; ean: string; name: string }[]>`
      SELECT DISTINCT ON (p.ean) rp.id, p.ean, rp.name FROM "RetailerProduct" rp
      JOIN "Retailer" r ON r.id = rp."retailerId" JOIN "Product" p ON p.id = rp."productId"
      JOIN "PriceObservation" po ON po."retailerProductId" = rp.id
      WHERE r.slug = 'jumbo' AND length(p.ean) >= 8 AND po.source NOT LIKE 'community:%' AND po."observedAt" > now() - interval '30 hours'
      LIMIT 2` as [typeof fresh, typeof stale];
    await seedConfirmedReceipt({ sessionId: `${RUN}-a`, store: "jumbo", hoursAgo: 2, branch: "Jumbo Calle 80", lines: [{ listingId: fresh.id, price: 1 }] });
    await seedConfirmedReceipt({ sessionId: `${RUN}-a`, store: "jumbo", hoursAgo: 80, lines: [{ listingId: stale.id, price: 2 }] });
  });
  afterAll(() => cleanupContributors(RUN));

  it("returns a 2 h receipt price with its branch, and not an 80 h one", async () => {
    const rows = await listingsByEan([fresh.ean, stale.ean], ["jumbo"], "receipt");
    expect(rows.map((r) => [r.listingId, r.price, r.branch])).toEqual([[fresh.id, 1, "Jumbo Calle 80"]]);
  });

  it("never shows receipt prices to online readers", async () => {
    const byEan = await listingsByEan([fresh.ean], ["jumbo"]);
    expect(byEan.length).toBeGreaterThan(0);
    expect(byEan.every((r) => !r.source.startsWith("community:") && r.price !== 1)).toBe(true);
    const searched = await searchListings(fresh.name, { stores: ["jumbo"], perStore: 50 });
    expect(searched.some((r) => r.source.startsWith("community:"))).toBe(false);
  });

  it("drops a receipt's prices once it is revoked", async () => {
    await db().receipt.updateMany({ where: { contributor: { sessionId: `${RUN}-a` } }, data: { status: "revoked" } });
    expect(await listingsByEan([fresh.ean], ["jumbo"], "receipt")).toEqual([]);
  });
});
