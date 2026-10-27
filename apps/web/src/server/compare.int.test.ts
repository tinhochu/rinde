import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@rinde/db";
import { compareProducts } from "./compare";
import { cleanupContributors, seedConfirmedReceipt } from "./receipt-fixture";
import { produceListing } from "./receipts";

const RUN = `test-compare-${Date.now()}`;

describe.skipIf(!process.env["INTEGRATION"])("comparing receipt produce prices (dev DB)", () => {
  beforeAll(async () => {
    const tx = db() as never;
    const [d1Kg, jumboKg, d1Unit] = await Promise.all([
      produceListing(tx, "d1", "banano", "kg"), produceListing(tx, "jumbo", "banano", "kg"), produceListing(tx, "d1", "banano", "unit"),
    ]);
    await seedConfirmedReceipt({ sessionId: `${RUN}-d1`, store: "d1", hoursAgo: 6, lines: [{ listingId: d1Kg.id, price: 3600, produceSlug: "banano" }, { listingId: d1Unit.id, price: 550, produceSlug: "banano" }] });
    await seedConfirmedReceipt({ sessionId: `${RUN}-jumbo`, store: "jumbo", hoursAgo: 2, branch: "Jumbo Hayuelos", lines: [{ listingId: jumboKg.id, price: 3980, produceSlug: "banano" }] });
  });
  afterAll(() => cleanupContributors(RUN));

  it("gives a verdict between per-kg prices, none across units, and keeps both groups together", async () => {
    const { products } = await compareProducts("banano", ["d1", "jumbo"]);
    const kg = products.findIndex((p) => p.key === "produce:banano:kg");
    const unit = products.findIndex((p) => p.key === "produce:banano:unit");
    expect(kg).toBeGreaterThanOrEqual(0);
    expect(Math.abs(unit - kg)).toBe(1);

    const perKg = products[kg]!;
    expect(perKg.offers.map((o) => [o.store, o.price, o.source])).toEqual([["D1", 3600, "receipt"], ["Jumbo", 3980, "receipt"]]);
    expect(perKg.spread).toBe(380);
    expect(perKg.offers[1]!.branch).toBe("Jumbo Hayuelos");

    // D1 per unit stands alone: nothing in its unit to compare with, so no verdict against Jumbo per kg.
    expect(products[unit]!.offers.map((o) => [o.store, o.price])).toEqual([["D1", 550]]);
    expect(products[unit]!.spread).toBe(0);
  }, 60_000);
});
