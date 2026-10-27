import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Candidate, PlanItem } from "@rinde/core";
import { museJson, MuseUnavailable, museConfig, type MuseConfig } from "./muse";

/** Distinct products shown to the model per item: the cheapest for the asked quantity, which the optimizer would pick. */
const PER_ITEM = 30;
/** Items per model call; calls run in parallel so a 15-item list stays well inside the timeout. */
const PER_CALL = 5;
const TTL_MS = 6 * 3_600_000;
const cache = new Map<string, { at: number; keep: Set<string> }>();
type Verdict = { shown: Set<string>; keep: Set<string> };

type Option = { key: string; name: string; size: string };

const optionKey = (c: Candidate) => `${c.name.toLowerCase().replace(/\s+/g, " ").trim()}|${c.size ? `${c.size.amount}${c.size.unit}` : ""}`;
const sizeLabel = (c: Candidate) => (c.size ? `${c.size.amount} ${c.size.unit === "unit" ? "und" : c.size.unit}` : "");
/** What the optimizer would pay for the asked quantity with this listing; only orders the options. */
const costFor = (item: PlanItem, c: Candidate) =>
  c.size && c.size.amount > 0 ? Math.ceil(item.quantity / c.size.amount) * c.price : Number.MAX_SAFE_INTEGER;

/**
 * Meta Muse decides which of an item's candidates are what the shopper asked for, whatever the brand
 * or pack size: "leche" is plain milk, not flavored milk; "arroz" is rice, not a rice ready meal.
 * The optimizer then buys the quantity as cheaply as it can among those, so the plan gets the most
 * per peso. The model sees names and sizes only and never a price; it is shown the options the
 * optimizer would reach for first and only removes those it turns down. An item it rejects entirely,
 * or any failure, keeps the word-rule candidates.
 */
export async function judgeKinds(items: PlanItem[], cfg: MuseConfig = museConfig()): Promise<PlanItem[]> {
  const asks = items.map((item) => {
    const seen = new Map<string, Option>();
    for (const c of [...item.candidates].sort((a, b) => costFor(item, a) - costFor(item, b))) {
      const key = optionKey(c);
      if (!seen.has(key)) seen.set(key, { key, name: c.name, size: sizeLabel(c) });
    }
    const options = [...seen.values()].slice(0, PER_ITEM);
    const cacheKey = createHash("sha256").update(JSON.stringify([item.label.toLowerCase(), item.unit, options.map((o) => o.key).sort()])).digest("hex");
    return { item, options, cacheKey };
  });

  const verdicts = new Map<string, Verdict>();
  const todo = asks.filter((a) => {
    if (a.options.length < 2) return false;
    const hit = cache.get(a.cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) verdicts.set(a.item.id, { shown: new Set(a.options.map((o) => o.key)), keep: hit.keep });
    return !verdicts.has(a.item.id);
  });

  const chunks = Array.from({ length: Math.ceil(todo.length / PER_CALL) }, (_, i) => todo.slice(i * PER_CALL, (i + 1) * PER_CALL));
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const answer = await ask(chunk.map((a) => ({ label: a.item.label, unit: a.item.unit, options: a.options })), cfg);
      chunk.forEach((a, i) => {
        const kept = new Set((answer.get(i) ?? []).map((n) => a.options[n]?.key).filter((k): k is string => !!k));
        cache.set(a.cacheKey, { at: Date.now(), keep: kept });
        verdicts.set(a.item.id, { shown: new Set(a.options.map((o) => o.key)), keep: kept });
      });
    } catch (e) {
      // A plan never fails because of the judge: those items keep their rule candidates.
      if (!(e instanceof MuseUnavailable)) console.error("[kind-judge]", e);
    }
  }));

  return items.map((item) => {
    const v = verdicts.get(item.id);
    if (!v?.keep.size) return item;
    // Only what the model saw and turned down goes; a listing the shopper pinned by accepting a swap always stays.
    const keep = (c: Candidate) => v.keep.has(optionKey(c)) || !v.shown.has(optionKey(c)) || c.listingId === item.pinnedListingId;
    return { ...item, candidates: item.candidates.filter(keep) };
  });
}

async function ask(asks: { label: string; unit: string; options: Omit<Option, "key">[] }[], cfg: MuseConfig): Promise<Map<number, number[]>> {
  const blocks = asks.map((a, i) =>
    `Item ${i}: "${a.label}" (bought by ${a.unit === "unit" ? "units" : a.unit === "g" ? "weight" : "volume"})\n` +
    a.options.map((o, n) => `  ${n}: ${o.name}${o.size ? ` · ${o.size}` : ""}`).join("\n"),
  ).join("\n\n");
  const instruction = `A family in Colombia wrote a grocery list and wants the most for their money; brand and pack size do not matter.
For each list item, keep the numbers of the store products a shopper who wrote that item would accept as the same thing: the same food, in its plain, everyday version unless the item asks for something specific (for example "leche" is plain milk, not flavored or powdered milk; "arroz" is rice, not a rice snack or ready meal; "atún" is canned tuna in any liquid).
Leave out anything that is a different product, a prepared dish, a snack or flavored version, or only contains the item as an ingredient. Use only the numbers listed under each item.

${blocks}`;
  const result = await museJson(
    instruction,
    {
      name: "accepted",
      schema: {
        type: "object", additionalProperties: false, required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["item", "keep"],
              properties: { item: { type: "integer" }, keep: { type: "array", items: { type: "integer" } } },
            },
          },
        },
      },
    },
    z.object({ items: z.array(z.object({ item: z.number().int(), keep: z.array(z.number().int()) })) }),
    { effort: "low" },
    cfg,
  );
  return new Map(result.items.map((r) => [r.item, r.keep]));
}
