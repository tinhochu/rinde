import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eggLabel } from "./eggs";
import { museJson, MuseUnavailable, type MuseConfig, museConfig } from "./muse";
import { isRelevant } from "./relevance";

/** A search result as the grouping sees it: names and sizes only, never prices. */
export type ValueItem = { key: string; name: string; brand: string; pack: number; unit: "g" | "ml" | "und" };
/** Products a shopper would swap for each other when only price per kg / L / unit matters. */
export type ValueGroup = { label: string; keys: string[] };
export type ValueGroups = { groups: ValueGroup[]; by: "muse" | "rules" };

const TTL_MS = 6 * 3_600_000;
const cache = new Map<string, { at: number; value: ValueGroups }>();

/**
 * Groups search results into kinds of product that are interchangeable regardless of brand and pack
 * size ("atún en agua", "atún en aceite"), so the app can point at the one that gives the most per peso.
 * Muse only decides which items belong together; it never sees a price, and the app computes every
 * price per kg from stored prices and sizes. Without Muse, one group by the planner's word rules.
 */
export async function valueGroups(query: string, items: ValueItem[], cfg: MuseConfig = museConfig()): Promise<ValueGroups> {
  const sized = items.filter((i) => i.pack > 0);
  const key = createHash("sha256").update(JSON.stringify([query.toLowerCase(), sized.map((i) => i.key).sort()])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Eggs are a kind per grade (A, AA, codorniz…), decided by rule so grades never mix; Muse sorts the rest.
  const eggs = eggGroups(sized);
  const rest = sized.filter((i) => !i.key.startsWith("egg:"));
  let value: ValueGroups;
  try {
    value = { groups: [...eggs, ...(await museGroups(query, rest, cfg))], by: "muse" };
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) throw e;
    value = { groups: [...eggs, ...ruleGroups(query, rest)], by: "rules" };
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function museGroups(query: string, items: ValueItem[], cfg: MuseConfig): Promise<ValueGroup[]> {
  if (items.length < 2) return [];
  const list = items.map((i, n) => `${n}: ${i.name}${i.brand ? ` · marca ${i.brand}` : ""} · ${i.pack} ${i.unit}`).join("\n");
  const instruction = `A shopper in Colombia searched a supermarket for "${query}" and wants the most product for their money; brand does not matter.
Group the products below into kinds a shopper would buy interchangeably: the same food in the same form and preparation (for example tuna in water and tuna in oil are different kinds; whole and skim milk are different kinds; brand and pack size never split a kind).
Leave out products that are not what was searched for. Only group products measured the same way (g, ml or und).
Give each kind a short Spanish label a shopper understands, like "Atún en agua". Use only the numbers in this list.

${list}`;
  const result = await museJson(
    instruction,
    {
      name: "kinds",
      schema: {
        type: "object", additionalProperties: false, required: ["kinds"],
        properties: {
          kinds: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["label", "items"],
              properties: { label: { type: "string" }, items: { type: "array", items: { type: "integer" } } },
            },
          },
        },
      },
    },
    z.object({ kinds: z.array(z.object({ label: z.string(), items: z.array(z.number().int()) })) }),
    { effort: "low" },
    cfg,
  );
  return clean(result.kinds.map((k) => ({ label: k.label, keys: k.items.map((n) => items[n]?.key).filter((x): x is string => !!x) })), items);
}

/** Cartons keyed `egg:<grade>:<count>` (see compare.ts), one kind per grade across counts. */
function eggGroups(items: ValueItem[]): ValueGroup[] {
  const byGrade = new Map<string, string[]>();
  for (const i of items) {
    const grade = /^egg:([^:]+):\d+$/.exec(i.key)?.[1];
    if (grade) byGrade.set(grade, [...(byGrade.get(grade) ?? []), i.key]);
  }
  return clean([...byGrade].map(([grade, keys]) => ({ label: eggLabel({ grade, count: 0 }), keys })), items);
}

/** Invented or repeated items are dropped, mixed units split off, and a kind needs two products to compare. */
function clean(groups: ValueGroup[], items: ValueItem[]): ValueGroup[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const used = new Set<string>();
  const out: ValueGroup[] = [];
  for (const g of groups) {
    const keys = g.keys.filter((k) => byKey.has(k) && !used.has(k));
    const unit = byKey.get(keys[0] ?? "")?.unit;
    const same = keys.filter((k) => byKey.get(k)!.unit === unit);
    const label = g.label.trim().slice(0, 40);
    if (same.length < 2 || !label) continue;
    same.forEach((k) => used.add(k));
    out.push({ label, keys: same });
  }
  return out;
}

function ruleGroups(query: string, items: ValueItem[]): ValueGroup[] {
  const relevant = items.filter((i) => isRelevant({ name: i.name, brand: i.brand || null, category: null }, query));
  const label = query.trim().charAt(0).toUpperCase() + query.trim().slice(1);
  return clean((["g", "ml", "und"] as const).map((u) => ({ label, keys: relevant.filter((i) => i.unit === u).map((i) => i.key) })), items);
}
