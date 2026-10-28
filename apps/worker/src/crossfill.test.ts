import { describe, expect, it, vi } from "vitest";
import type { Offer, RetailerClient } from "@rinde/retailers";
import { CROSS_FILL_BATCH, fillStore } from "./crossfill";

const offer = (ean: string): Offer => ({
  retailer: "carulla", externalId: ean, name: `Producto ${ean}`, brand: null, ean, category: null, size: null,
  price: 1000, listPrice: 1000, available: true, stock: 1, url: "", imageUrl: null,
  source: "carulla:vtex-catalog", sourceUrl: "https://www.carulla.com/io/api/x", observedAt: new Date(),
});

describe("fillStore", () => {
  it("asks in batches, waits out rate limits, and keeps going when one batch fails", async () => {
    const eans = Array.from({ length: CROSS_FILL_BATCH * 2 + 5 }, (_, i) => `77000000${String(i).padStart(5, "0")}`);
    const byEans = vi.fn(async (batch: string[], opts?: { patient?: boolean }) => {
      expect(opts).toEqual({ patient: true });
      if (batch.includes(eans[CROSS_FILL_BATCH]!)) throw new Error("carulla 429");
      return batch.slice(0, 2).map(offer);
    });
    const client = { slug: "carulla", byEans } as unknown as RetailerClient;
    const recorded: string[] = [];

    const result = await fillStore(client, eans, async (o) => { recorded.push(o.ean!); });

    expect(byEans).toHaveBeenCalledTimes(3);
    expect(recorded).toEqual([eans[0], eans[1], eans[CROSS_FILL_BATCH * 2], eans[CROSS_FILL_BATCH * 2 + 1]]);
    expect(result).toEqual({ found: 4, checked: CROSS_FILL_BATCH + 5, unchecked: eans.slice(CROSS_FILL_BATCH, CROSS_FILL_BATCH * 2) });
  });
});
