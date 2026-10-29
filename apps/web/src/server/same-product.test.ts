import { describe, expect, it } from "vitest";
import type { MatchItem } from "@rinde/core";
import type { MuseConfig } from "./muse";
import { fetchStorePhoto, judgeSameProduct } from "./same-product";

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });

function cfg(text: string, calls: unknown[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 50,
    fetch: (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string)); return reply(text); }) as typeof fetch,
  };
}
const unavailable: MuseConfig = { ...cfg(""), apiKey: undefined };

// Answers are cached per target and candidate set, so each test uses its own target id.
let n = 0;
const target = (): MatchItem => ({ id: `t${n++}`, name: "Leche deslactosada Alpina x1L", brand: "ALPINA", aisle: "dairy" });
type Listing = MatchItem & { price: number };
const listing = (id: string, name: string, brand: string | null, price: number): Listing => ({ id, name, brand, aisle: "dairy", price });

const abbreviated = listing("a", "Leche Deslact. ALPINA 1000 ml", "Alpina", 7900);
const skim = listing("b", "Leche 2.0 Alpina 1000 ml", "Alpina", 6900);
const small = listing("c", "Leche deslactosada Alpina 900 ml", "Alpina", 6500);

describe("judgeSameProduct", () => {
  it("asks once, at low effort, with names, brands and sizes but no prices", async () => {
    const calls: { input: { content: { text: string }[] }[]; reasoning?: unknown }[] = [];
    await judgeSameProduct(target(), [abbreviated, skim, small], cfg('{"pick":0,"reason":"Misma leche"}', calls));
    const text = calls[0]!.input[0]!.content[0]!.text;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reasoning).toEqual({ effort: "low" });
    expect(text).not.toMatch(/\$|7900|6900|6500/);
    // The 900 ml listing never reaches the model: it isn't the same size.
    expect(text).toContain("Leche Deslact. ALPINA 1000 ml · marca Alpina · 1000 ml");
    expect(text).not.toContain("900 ml ·");
  });

  it("returns Muse's pick and its reason", async () => {
    const verdict = await judgeSameProduct(target(), [abbreviated, skim], cfg('{"pick":0,"reason":"Misma leche Alpina deslactosada de 1 L; la tienda la abrevia"}'));
    expect(verdict).toEqual({ pick: abbreviated, by: "muse", reason: "Misma leche Alpina deslactosada de 1 L; la tienda la abrevia" });
  });

  it("returns none when Muse says none is the same product", async () => {
    const verdict = await judgeSameProduct(target(), [skim], cfg('{"pick":-1,"reason":"Es leche semidescremada, no deslactosada"}'));
    expect(verdict).toEqual({ pick: null, by: "muse", reason: "Es leche semidescremada, no deslactosada" });
  });

  it("says not sure, with no pick, when the name fits more than one listing", async () => {
    const calls: unknown[] = [];
    const t = target();
    const bag = listing("h", "Leche Deslactosada Alpina Bolsa 1000 ml", "Alpina", 7700);
    const answer = '{"pick":-2,"reason":"El nombre no dice si es en bolsa o en caja"}';
    const verdict = await judgeSameProduct(t, [abbreviated, bag], cfg(answer, calls));
    expect(verdict).toEqual({ pick: null, by: "muse", reason: "El nombre no dice si es en bolsa o en caja", unsure: true });
    // Cached like any other answer.
    expect(await judgeSameProduct(t, [abbreviated, bag], cfg(answer, calls))).toMatchObject({ unsure: true });
    expect(calls).toHaveLength(1);
  });

  it("reads not sure about a single listing as none: there is nothing to choose between", async () => {
    const verdict = await judgeSameProduct(target(), [skim], cfg('{"pick":-2,"reason":"No sé"}'));
    expect(verdict).toEqual({ pick: null, by: "muse", reason: "No sé" });
  });

  it("looks at the photos when the names leave it not sure, and keeps the answer the photos give", async () => {
    const t = { ...target(), imageUrl: "https://x.vteximg.com.br/arquivos/ids/1/a.jpg" };
    const bag = { ...listing("i", "Leche Deslactosada Alpina Bolsa 1000 ml", "Alpina", 7700), imageUrl: "https://x.vteximg.com.br/arquivos/ids/2/b.jpg" };
    const box = { ...abbreviated, id: "j", imageUrl: "https://x.vteximg.com.br/arquivos/ids/3/c.jpg" };
    const bodies: { input: { content: { type: string; text?: string }[] }[] }[] = [];
    // First not sure; then, with the photos, the bag listing by its number in the list.
    const bagNumber = (text: string) => Number(/^(\d+): .*Bolsa/m.exec(text)![1]);
    const cfgSeq: MuseConfig = {
      ...cfg(""),
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        bodies.push(body);
        return reply(bodies.length === 1 ? '{"pick":-2,"reason":"El nombre no dice si es en bolsa o en caja"}' : JSON.stringify({ pick: bagNumber(body.input[0].content[0].text), reason: "La foto muestra la misma bolsa" }));
      }) as typeof fetch,
    };
    const fetched: string[] = [];
    const fetchPhoto = async (url: string) => { fetched.push(url); return { data: new Uint8Array([1]), mime: "image/jpeg" }; };
    const verdict = await judgeSameProduct(t, [box, bag], cfgSeq, { photos: "unsure", fetchPhoto });
    expect(verdict).toEqual({ pick: bag, by: "muse", reason: "La foto muestra la misma bolsa" });
    expect(bodies.map((b) => b.input[0]!.content.filter((c) => c.type === "input_image").length)).toEqual([0, 3]);
    expect(fetched).toHaveLength(3);
  });

  it("stays not sure when the photo look fails", async () => {
    const t = { ...target(), imageUrl: "https://x.vteximg.com.br/arquivos/ids/1/a.jpg" };
    const bag = { ...listing("k", "Leche Deslactosada Alpina Bolsa 1000 ml", "Alpina", 7700), imageUrl: "https://x.vteximg.com.br/arquivos/ids/2/b.jpg" };
    let n = 0;
    const flaky: MuseConfig = {
      ...cfg(""),
      fetch: (async () => (n++ === 0 ? reply('{"pick":-2,"reason":"No se sabe"}') : new Response("", { status: 429 }))) as typeof fetch,
    };
    const verdict = await judgeSameProduct(t, [{ ...abbreviated, id: "l" }, bag], flaky, { photos: "unsure", fetchPhoto: async () => ({ data: new Uint8Array([1]), mime: "image/jpeg" }) });
    expect(verdict).toMatchObject({ pick: null, unsure: true, reason: "No se sabe" });
  });

  it("fetches photos only from the stores' image hosts", async () => {
    expect(await fetchStorePhoto("https://evil.example/arquivos/ids/1/a.jpg")).toBeNull();
    expect(await fetchStorePhoto("http://x.vteximg.com.br/arquivos/ids/1/a.jpg")).toBeNull();
  });

  it("throws away a pick outside the list, such as the 900 ml listing it was never shown", async () => {
    // The store has [abbreviated, 900 ml]; only the 1 L listing is shown, as number 0. Number 1 isn't a candidate.
    const verdict = await judgeSameProduct(target(), [abbreviated, small], cfg('{"pick":1,"reason":"La de 900 ml"}'));
    expect(verdict.pick).toBeNull();
  });

  it("caches a verdict, including none", async () => {
    const calls: unknown[] = [];
    const t = target();
    await judgeSameProduct(t, [skim], cfg('{"pick":-1,"reason":"No"}', calls));
    await judgeSameProduct(t, [skim], cfg('{"pick":-1,"reason":"No"}', calls));
    expect(calls).toHaveLength(1);
  });

  it("asks nothing when no listing has the same size and brand", async () => {
    const calls: unknown[] = [];
    const verdict = await judgeSameProduct(target(), [small, listing("d", "Leche deslactosada Colanta 1 L", "Colanta", 5000)], cfg("{}", calls));
    expect(verdict).toEqual({ pick: null, by: "muse", reason: null });
    expect(calls).toHaveLength(0);
  });

  it("falls back to the strict rule without Muse", async () => {
    const exact = listing("e", "Leche Deslactosada ALPINA 1 L", "Alpina S.A.", 7800);
    expect(await judgeSameProduct(target(), [exact, skim], unavailable)).toEqual({ pick: exact, by: "rules", reason: null });
  });

  it("stays undecided without Muse when the rule can't tell", async () => {
    const twin = listing("f", "Leche Deslactosada Alpina Bolsa 1000 ml", "Alpina", 7700);
    const exact = listing("g", "Leche Deslactosada ALPINA 1 L", "Alpina", 7800);
    expect(await judgeSameProduct(target(), [exact, twin], unavailable)).toMatchObject({ pick: null, undecided: true });
    expect(await judgeSameProduct(target(), [abbreviated], unavailable)).toMatchObject({ pick: null, undecided: true });
  });
});
