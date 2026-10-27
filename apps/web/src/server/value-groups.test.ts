import { describe, expect, it } from "vitest";
import type { MuseConfig } from "./muse";
import { valueGroups, type ValueItem } from "./value-groups";

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });

function cfg(text: string, calls: unknown[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 50,
    fetch: (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string)); return reply(text); }) as typeof fetch,
  };
}

// Each test uses its own query, since results are cached per query and product set.
const items = (q: string): ValueItem[] => [
  { key: `${q}-1`, name: "Atún PAN trozos en agua (98 gr)", brand: "PAN", pack: 150, unit: "g" },
  { key: `${q}-2`, name: "Atún en Agua Carlo Forte 170 G Neto", brand: "CARLO FORTE", pack: 170, unit: "g" },
  { key: `${q}-3`, name: "Atún PAN trozos en aceite (98 gr)", brand: "PAN", pack: 150, unit: "g" },
  { key: `${q}-4`, name: "Atún en Aceite Carlo Forte 170 G Neto", brand: "CARLO FORTE", pack: 170, unit: "g" },
  { key: `${q}-5`, name: "Atún pack x 3 und", brand: "", pack: 3, unit: "und" },
];

describe("valueGroups", () => {
  it("keeps the model's kinds, low effort, and never sends prices", async () => {
    const calls: { input: { content: { text: string }[] }[]; reasoning?: unknown }[] = [];
    const out = await valueGroups("atun a", items("a"), cfg('{"kinds":[{"label":"Atún en agua","items":[0,1]},{"label":"Atún en aceite","items":[2,3]}]}', calls));
    expect(out).toEqual({ by: "muse", groups: [{ label: "Atún en agua", keys: ["a-1", "a-2"] }, { label: "Atún en aceite", keys: ["a-3", "a-4"] }] });
    expect(calls[0]!.reasoning).toEqual({ effort: "low" });
    expect(calls[0]!.input[0]!.content[0]!.text).not.toMatch(/\$/);
  });

  it("drops invented and repeated items, mixed units and kinds of one", async () => {
    const out = await valueGroups("atun b", items("b"), cfg('{"kinds":[{"label":"Atún","items":[0,1,4,99]},{"label":"Otra vez","items":[1,2]},{"label":"Solo","items":[3]}]}'));
    expect(out.groups).toEqual([{ label: "Atún", keys: ["b-1", "b-2"] }]);
  });

  it("falls back to the word rules without a key", async () => {
    const out = await valueGroups("atun c", items("c"), { ...cfg("{}"), apiKey: undefined });
    expect(out.by).toBe("rules");
    expect(out.groups).toEqual([{ label: "Atun c", keys: ["c-1", "c-2", "c-3", "c-4"] }]);
  });

  it("groups egg cartons by grade by rule, and never asks the model about them", async () => {
    const calls: { input: { content: { text: string }[] }[] }[] = [];
    const eggs: ValueItem[] = [
      { key: "egg:A:30", name: "Huevos tipo A", brand: "Varias marcas", pack: 30, unit: "und" },
      { key: "egg:A:12", name: "Huevos A rojos San Pio x12und", brand: "SAN PIO", pack: 12, unit: "und" },
      { key: "egg:B:30", name: "Huevo Tipo B 30 Und", brand: "SOL NACIENTE", pack: 30, unit: "und" },
      { key: "egg:AA:12", name: "Huevos tipo AA", brand: "Varias marcas", pack: 12, unit: "und" },
      { key: "egg:AA:30", name: "Huevos AA rojos Vigor x30und", brand: "VIGOR", pack: 30, unit: "und" },
    ];
    const out = await valueGroups("huevos grade", eggs, cfg('{"kinds":[]}', calls));
    expect(out.groups).toEqual([
      { label: "Huevos tipo A", keys: ["egg:A:30", "egg:A:12"] },
      { label: "Huevos tipo AA", keys: ["egg:AA:12", "egg:AA:30"] },
    ]);
    expect(calls.map((c) => c.input[0]!.content[0]!.text).join("")).not.toMatch(/Huevo/);
  });
});
