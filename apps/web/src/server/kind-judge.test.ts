import { describe, expect, it } from "vitest";
import type { Candidate, PlanItem } from "@rinde/core";
import type { MuseConfig } from "./muse";
import { judgeKinds } from "./kind-judge";

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });

function cfg(text: string, calls: unknown[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 50,
    fetch: (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string)); return reply(text); }) as typeof fetch,
  };
}

const cand = (listingId: string, name: string, price: number, amount: number): Candidate => ({
  listingId, retailer: "d1", name, brand: null, price, size: { amount, unit: "ml" }, url: "", source: "test",
  observedAt: "2026-10-26T00:00:00Z", priceStatus: "snapshot", isLiteralMatch: false, isSubstitute: true,
});

// Each test uses its own label, since answers are cached per item and option set.
const item = (label: string, pinned?: string): PlanItem => ({
  id: label, label, quantity: 1000, unit: "ml", essential: true, allowSubstitute: true, pinnedListingId: pinned,
  candidates: [
    cand("a", "Leche entera Alquería 1 L", 4200, 1000),
    cand("b", "Leche sabor fresa 1 L", 3900, 1000),
    cand("c", "Leche entera Colanta 1 L", 4500, 1000),
    cand("c2", "Leche Entera Colanta  1 L", 4400, 1000),
  ],
});

describe("judgeKinds", () => {
  it("asks once per item list, low effort, with names and sizes but no prices", async () => {
    const calls: { input: { content: { text: string }[] }[]; reasoning?: unknown }[] = [];
    await judgeKinds([item("leche a")], cfg('{"items":[{"item":0,"keep":[1,2]}]}', calls));
    const text = calls[0]!.input[0]!.content[0]!.text;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reasoning).toEqual({ effort: "low" });
    expect(text).not.toMatch(/\$|3900|4200|4400|4500/);
    // Cheapest first for the asked quantity; the two Colanta listings are one product.
    expect(text).toContain("0: Leche sabor fresa 1 L · 1000 ml\n  1: Leche entera Alquería 1 L · 1000 ml\n  2: Leche Entera Colanta  1 L · 1000 ml");
  });

  it("drops a flavored product and keeps every listing of an accepted one", async () => {
    const [out] = await judgeKinds([item("leche b")], cfg('{"items":[{"item":0,"keep":[1,2,99]}]}'));
    expect(out!.candidates.map((c) => c.listingId)).toEqual(["a", "c", "c2"]);
  });

  it("keeps a pinned listing and the rule candidates when the model rejects everything", async () => {
    const [pinned] = await judgeKinds([item("leche c", "b")], cfg('{"items":[{"item":0,"keep":[1]}]}'));
    expect(pinned!.candidates.map((c) => c.listingId)).toEqual(["a", "b"]);
    const [none] = await judgeKinds([item("leche d")], cfg('{"items":[{"item":0,"keep":[]}]}'));
    expect(none!.candidates).toHaveLength(4);
  });

  it("keeps listings past the ones shown to the model", async () => {
    const many = item("leche f");
    many.candidates.push(...Array.from({ length: 30 }, (_, n) => cand(`x${n}`, `Leche entera marca ${n} 1 L`, 5000 + n, 1000)));
    const [out] = await judgeKinds([many], cfg('{"items":[{"item":0,"keep":[1]}]}'));
    // 30 options shown (fresa, alquería, colanta, marca 0–26); 1 accepted, 29 turned down; marca 27–29 never judged.
    expect(out!.candidates.map((c) => c.listingId)).toEqual(["a", "x27", "x28", "x29"]);
  });

  it("keeps the rule candidates without a key", async () => {
    const [out] = await judgeKinds([item("leche e")], { ...cfg("{}"), apiKey: undefined });
    expect(out!.candidates).toHaveLength(4);
  });
});
