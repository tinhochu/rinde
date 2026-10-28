import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL, routeOptions, type Branch, type Candidate, type LatLon, type PlanItem, type RetailerSlug, type RouteOption } from "@rinde/core";
import { adviseRoute, ruleChoice, usesOnlyGivenFigures, describeOptions } from "./route-advice";
import type { MuseConfig } from "./muse";

let seq = 0;
const cand = (retailer: RetailerSlug, price: number): Candidate => ({
  listingId: `${retailer}-${++seq}`, retailer, name: `Producto ${seq}`, brand: null, price, size: { amount: 1, unit: "unit" },
  url: "https://example.com", source: "test", observedAt: "2026-10-28T10:00:00.000Z", priceStatus: "snapshot", isLiteralMatch: true, isSubstitute: false,
});
const item = (id: string, candidates: Candidate[]): PlanItem => ({ id, label: id, quantity: 1, unit: "unit", essential: true, allowSubstitute: true, candidates });

const D1: Branch = { id: "d1", chain: "d1", name: "D1 Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.65, lon: -74.066 };
const CARULLA: Branch = { id: "ca", chain: "carulla", name: "Carulla Calle 63", address: null, area: "Chapinero, Bogotá", lat: 4.6552, lon: -74.0597 };

/** "Solo D1 $84.500" and "D1 + Carulla": 600 m and 8 min on foot, saving `saving`. */
async function options(saving: number): Promise<RouteOption[]> {
  const items = [
    item("arroz", [cand("d1", 40_000), cand("carulla", 40_000 - saving)]),
    item("leche", [cand("d1", 44_500), cand("carulla", 50_000)]),
  ];
  const loop = { distanceM: 600, durationS: 480, coordinates: [] as LatLon[], legs: [] };
  const { options } = await routeOptions({
    items, anchor: { chain: "d1", point: [D1.lat, D1.lon], branch: D1 }, start: null, branches: [CARULLA],
    retailers: ["d1", "carulla"], travel: { mode: "walk", ...DEFAULT_TRAVEL }, budget: 500_000,
    provider: { route: async () => loop, table: async () => ({ durationsS: [[240]] }) },
  });
  return options;
}

const reply = (body: unknown) => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(body) }] }] }));
function muse(answer: unknown, prompts: string[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "m", timeoutMs: 1000,
    fetch: (async (_url: string, init: RequestInit) => {
      prompts.push(JSON.parse(init.body as string).input[0].content[0].text);
      return answer instanceof Response ? answer : reply(answer);
    }) as typeof fetch,
  };
}
const walk = { mode: "walk" as const };

describe("adviseRoute", () => {
  it("takes Muse's valid pick and its explanation, and never shows it an item price", async () => {
    const opts = await options(12_300);
    const prompts: string[] = [];
    const advice = await adviseRoute(opts, walk, "", {}, muse({
      choice: 1, question: null,
      explanation: "Carulla queda a 600 m caminando de tu D1: ahorras $12.300 por 8 min más.",
      itemOrder: [{ stop: 1, items: ["leche"] }, { stop: 2, items: ["arroz"] }],
    }, prompts));
    expect(advice).toMatchObject({ source: "muse", choice: 1, explanation: "Carulla queda a 600 m caminando de tu D1: ahorras $12.300 por 8 min más." });
    expect(prompts[0]).toContain("Total de la compra $84.500");
    expect(prompts[0]).toContain("ahorro neto $12.300");
    for (const price of ["$40.000", "$27.700", "$44.500", "$50.000"]) expect(prompts[0]).not.toContain(price);
  });

  it("falls back to the rule on an option that wasn't offered", async () => {
    const advice = await adviseRoute(await options(12_300), walk, "x1", {}, muse({ choice: 4, question: null, explanation: "Ve a Jumbo.", itemOrder: [] }));
    expect(advice).toMatchObject({ source: "rule", choice: 1, explanation: "Pasar por Carulla te ahorra $12.300, por 8 min más a pie." });
  });

  it("falls back when Muse states a figure it wasn't given", async () => {
    const advice = await adviseRoute(await options(12_300), walk, "x2", {}, muse({ choice: 1, question: null, explanation: "Ahorras $15.000 en Carulla.", itemOrder: [] }));
    expect(advice.source).toBe("rule");
    const advice2 = await adviseRoute(await options(12_300), walk, "x3", {}, muse({ choice: 1, question: null, explanation: "Carulla está a 2 km: ahorras $12.300.", itemOrder: [] }));
    expect(advice2.source).toBe("rule");
  });

  it("passes on Muse's question, with the rule's pick meanwhile, and doesn't ask twice", async () => {
    const ask = { choice: null, question: "¿Vas con carro?", explanation: "", itemOrder: [] };
    const advice = await adviseRoute(await options(12_300), walk, "x4", {}, muse(ask));
    expect(advice).toMatchObject({ question: "¿Vas con carro?", choice: 1, source: "rule" });
    const again = await adviseRoute(await options(12_300), walk, "x4", { allowQuestion: false }, muse(ask));
    expect(again.question).toBeNull();
  });

  it("uses the rule when Muse is unavailable, and says what staying gives up", async () => {
    const opts = await options(4_000); // $4.000 is under 5% of $84.500
    const advice = await adviseRoute(opts, walk, "x5", {}, { ...muse({}), apiKey: undefined });
    expect(advice).toMatchObject({
      source: "rule", choice: 0, foregone: { label: "Carulla", net: 4_000 },
      explanation: "Compra todo en tu D1: pasar por Carulla solo te ahorraría $4.000.",
    });
  });

  it("lets Muse stay at the anchor for this person, with a valid explanation", async () => {
    const advice = await adviseRoute(await options(4_000), walk, "voy con bebé y llevo el mercado a pie", {}, muse({
      choice: 0, question: null, explanation: "Con el bebé y el mercado a pie, $4.000 no compensan los 8 min más.", itemOrder: [],
    }));
    expect(advice).toMatchObject({ source: "muse", choice: 0, foregone: { label: "Carulla", net: 4_000 } });
  });
});

describe("the rule", () => {
  it("needs $3.000 and 5% of the anchor-only total", async () => {
    expect(ruleChoice(await options(4_300))).toBe(1); // 5,1%
    expect(ruleChoice(await options(4_000))).toBe(0); // 4,7%
  });
});

describe("usesOnlyGivenFigures", () => {
  it("accepts a distance said in meters or kilometers, and an option's own figures", async () => {
    const { figures } = describeOptions(await options(12_300), "walk");
    expect(usesOnlyGivenFigures("Son 0,6 km y 8 minutos: ahorras $12.300.", figures)).toBe(true);
    expect(usesOnlyGivenFigures("Son 9 minutos.", figures)).toBe(false);
  });
});
