import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { chooseCandidate, chooseCandidates, demoFixture, extractReceipt, museJson, MuseUnavailable, sha256, type MuseConfig } from "./muse";

const reply = (text: string, status = 200) =>
  new Response(JSON.stringify({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] }), { status });

function cfg(responses: (Response | "hang")[], calls: unknown[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 50,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      const next = responses.shift();
      if (next === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("timeout"))));
      return next!;
    }) as typeof fetch,
  };
}

const schema = { name: "t", schema: { type: "object" } };
const shape = z.object({ a: z.string() });

describe("museJson", () => {
  it("sends the image as a data URL with a strict schema and parses the message text", async () => {
    const calls: { url: string; body: { input: { content: { type: string; image_url?: string }[] }[]; text: unknown } }[] = [];
    const out = await museJson("x", schema, shape, { images: [{ data: new Uint8Array([1, 2]), mime: "image/jpeg" }] }, cfg([reply('{"a":"ok"}')], calls));
    expect(out).toEqual({ a: "ok" });
    expect(calls[0]!.url).toBe("https://api.example/v1/responses");
    expect(calls[0]!.body.input[0]!.content[1]).toEqual({ type: "input_image", image_url: "data:image/jpeg;base64,AQI=" });
    expect(calls[0]!.body.text).toMatchObject({ format: { type: "json_schema", strict: true } });
  });

  it("retries once after a 5xx", async () => {
    expect(await museJson("x", schema, shape, {}, cfg([new Response("", { status: 503 }), reply('{"a":"b"}')]))).toEqual({ a: "b" });
  });

  it("retries once on invalid JSON, then gives up", async () => {
    await expect(museJson("x", schema, shape, {}, cfg([reply("not json"), reply('{"wrong":1}')]))).rejects.toBeInstanceOf(MuseUnavailable);
  });

  it("fails as unavailable on timeout without retrying", async () => {
    const calls: unknown[] = [];
    const failure = await museJson("x", schema, shape, {}, cfg(["hang", reply('{"a":"b"}')], calls)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MuseUnavailable);
    expect((failure as MuseUnavailable).timedOut).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("tells an outage apart from running out of time", async () => {
    const failure = await museJson("x", schema, shape, {}, cfg([new Response("", { status: 401 })])).catch((e: unknown) => e);
    expect((failure as MuseUnavailable).timedOut).toBe(false);
  });

  it("is unavailable without a key", async () => {
    await expect(museJson("x", schema, shape, {}, { ...cfg([]), apiKey: undefined })).rejects.toBeInstanceOf(MuseUnavailable);
  });
});

describe("extractReceipt", () => {
  const empty = '{"store":"","branch":"","purchased_at":"","total":"","invoice_number":"","cufe":"","lines":[]}';
  type Call = { body: { input: { content: { type: string; text?: string }[] }[] } };

  it("sends every part of a long receipt in order, as one receipt", async () => {
    const calls: Call[] = [];
    const parts = [1, 2, 3].map((n) => ({ data: new Uint8Array([n]), mime: "image/jpeg" }));
    await extractReceipt(parts, cfg([reply(empty)], calls));
    const content = calls[0]!.body.input[0]!.content;
    expect(content.map((c) => c.type)).toEqual(["input_text", "input_image", "input_image", "input_image"]);
    expect(content[0]!.text).toMatch(/3 parts, in order from the top/);
  });

  it("says nothing about parts for a single photo", async () => {
    const calls: Call[] = [];
    await extractReceipt([{ data: new Uint8Array([1]), mime: "image/jpeg" }], cfg([reply(empty)], calls));
    expect(calls[0]!.body.input[0]!.content[0]!.text).not.toMatch(/parts/);
  });
});

describe("chooseCandidate", () => {
  const options = [{ id: "a1", name: "Arroz Diana 1 kg", size: "1 kg" }, { id: "a2", name: "Arroz Roa 1 kg", size: "1 kg" }];
  it("returns a given id", async () => {
    expect(await chooseCandidate("ARZ DIANA 1KG", "Jumbo", options, cfg([reply('{"choices":[{"line":0,"id":"a1"}]}')]))).toBe("a1");
  });
  it("discards an id the model made up", async () => {
    expect(await chooseCandidate("ARZ DIANA 1KG", "Jumbo", options, cfg([reply('{"choices":[{"line":0,"id":"zz9"}]}')]))).toBeNull();
    expect(await chooseCandidate("ARZ DIANA 1KG", "Jumbo", options, cfg([reply('{"choices":[{"line":0,"id":"none"}]}')]))).toBeNull();
  });
});

describe("chooseCandidates", () => {
  it("answers every line in one call, keeping only each line's own ids", async () => {
    const calls: unknown[] = [];
    const out = await chooseCandidates("D1", [
      { index: 2, text: "ARZ DIANA", candidates: [{ id: "a1", name: "Arroz Diana", size: "" }] },
      { index: 5, text: "LCH ALQ", candidates: [{ id: "l1", name: "Leche Alquería", size: "" }] },
    ], cfg([reply('{"choices":[{"line":2,"id":"a1"},{"line":5,"id":"a1"}]}')], calls));
    expect(calls).toHaveLength(1);
    expect(out).toEqual(new Map([[2, "a1"], [5, null]]));
  });
});

describe("demo fixtures", () => {
  const saved = process.env["DEMO_RECEIPTS"];
  afterEach(() => { process.env["DEMO_RECEIPTS"] = saved; });

  it("finds a recorded extraction by image hash, and nothing for an unknown photo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fixtures-"));
    const image = new Uint8Array([9, 9, 9]);
    const extraction = { store: "Jumbo", branch: "", purchased_at: "", total: "", invoice_number: "POS 1", cufe: "", lines: [] };
    await writeFile(path.join(dir, "jumbo.json"), JSON.stringify({ imageSha256: sha256(image), extraction }));
    expect(await demoFixture(sha256(image), dir)).toEqual(extraction);
    expect(await demoFixture(sha256(new Uint8Array([1])), dir)).toBeNull();
  });
});
