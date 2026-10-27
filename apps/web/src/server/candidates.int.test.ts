import { describe, expect, it } from "vitest";
import { candidatesFor } from "./candidates";
import { enabledRetailers } from "./offers";

// Runs against the dev database snapshot: INTEGRATION=1 pnpm --filter @rinde/web test
describe.skipIf(!process.env["INTEGRATION"])("candidatesFor (dev DB)", () => {
  it('"arroz 1 kg" returns rice from every enabled store, no non-rice items in the top 5', async () => {
    const item = await candidatesFor({
      id: "arroz", label: "arroz 1 kg", query: "arroz", brand: null,
      quantity: 1000, unit: "g", essential: true, allowSubstitute: true,
    });
    const stores = new Set(item.candidates.map((c) => c.retailer));
    expect(stores).toEqual(new Set(enabledRetailers()));
    for (const retailer of enabledRetailers()) {
      const top5 = item.candidates.filter((c) => c.retailer === retailer).slice(0, 5);
      for (const c of top5) expect(c.name.toLowerCase()).toMatch(/^arroz/);
    }
    expect(item.candidates.every((c) => c.size?.unit === "g" && c.observationId)).toBe(true);
  }, 60_000);

  it("marks the requested brand as literal and other brands as substitutes", async () => {
    const item = await candidatesFor({
      id: "arroz", label: "Arroz Diana", query: "arroz", brand: "Diana",
      quantity: 1000, unit: "g", essential: true, allowSubstitute: false,
    });
    const literal = item.candidates.filter((c) => c.isLiteralMatch);
    expect(literal.length).toBeGreaterThan(0);
    for (const c of literal) expect(`${c.brand} ${c.name}`.toLowerCase()).toContain("diana");
    expect(item.candidates.some((c) => c.isSubstitute)).toBe(true);
  }, 60_000);
});
