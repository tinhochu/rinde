import { describe, expect, it } from "vitest";
import type { MuseConfig } from "./muse";
import { readListPhoto } from "./list-photo";

const reply = (text: string) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });

function cfg(text: string, calls: unknown[] = []): MuseConfig {
  return {
    apiKey: "test", baseUrl: "https://api.example/v1", model: "muse-spark-1.3", timeoutMs: 50,
    fetch: (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string)); return reply(text); }) as typeof fetch,
  };
}

const image = { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };

describe("readListPhoto", () => {
  it("sends the photo and keeps the items it read, without prices", async () => {
    const calls: { input: { content: { type: string; image_url?: string }[] }[] }[] = [];
    const items = await readListPhoto(image, cfg('{"items":[{"name":"Arroz","quantity":3000,"unit":"g","brand":""},{"name":"Leche","quantity":2000,"unit":"ml","brand":"Alquería"}]}', calls));
    expect(calls[0]!.input[0]!.content.some((c) => c.type === "input_image" && c.image_url?.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(items.map(({ id: _id, ...i }) => i)).toEqual([
      { name: "Arroz", quantity: 3000, unit: "g", brand: "", allowSubstitution: true },
      { name: "Leche", quantity: 2000, unit: "ml", brand: "Alquería", allowSubstitution: true },
    ]);
  });

  it("drops empty names and impossible amounts", async () => {
    const items = await readListPhoto(image, cfg('{"items":[{"name":" ","quantity":1,"unit":"und","brand":""},{"name":"Huevos","quantity":0,"unit":"und","brand":""},{"name":"Sal","quantity":1000,"unit":"g","brand":""}]}'));
    expect(items.map((i) => i.name)).toEqual(["Sal"]);
  });
});
