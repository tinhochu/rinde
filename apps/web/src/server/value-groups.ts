import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eggLabel } from "./eggs";
import { museJson, MuseUnavailable, type MuseConfig, museConfig } from "./muse";
import { isRelevant } from "./relevance";

/** A search result as the grouping sees it: names and sizes only, never prices. */
export type ValueItem = { key: string; name: string; brand: string; pack: number; unit: "g" | "ml" | "und" };
/** Products a shopper would swap for each other when only price per kg / L / unit matters. */
export type ValueGroup = { label: string; keys: string[]; /** Muse's one line on why each product belongs, by key */ reasons?: Record<string, string> };
export type ValueGroups = { groups: ValueGroup[]; by: "muse" | "rules" };

const TTL_MS = 6 * 3_600_000;
/** The word-rule fallback is kept briefly, so one Muse outage doesn't hide its grouping and reasons for hours. */
const FALLBACK_TTL_MS = 2 * 60_000;
const cache = new Map<string, { at: number; value: ValueGroups }>();
const fresh = (hit: { at: number; value: ValueGroups }) => Date.now() - hit.at < (hit.value.by === "muse" ? TTL_MS : FALLBACK_TTL_MS);

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
  if (hit && fresh(hit)) return hit.value;

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
Give each kind a short Spanish label a shopper understands, like "Atún en agua". For each product in a kind, give a one-line reason in Spanish a shopper understands, saying what it is even when a store gives it its own name, like "Leche semidescremada de otra marca". Use only the numbers in this list.

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
              properties: {
                label: { type: "string" },
                items: {
                  type: "array",
                  items: { type: "object", additionalProperties: false, required: ["item", "reason"], properties: { item: { type: "integer" }, reason: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    },
    z.object({ kinds: z.array(z.object({ label: z.string(), items: z.array(z.union([z.number().int(), z.object({ item: z.number().int(), reason: z.string() })])) })) }),
    { effort: "low" },
    cfg,
  );
  return clean(
    result.kinds.map((k) => {
      const picked = k.items.map((x) => (typeof x === "number" ? { item: x, reason: "" } : x)).flatMap((x) => (items[x.item] ? [{ key: items[x.item]!.key, reason: x.reason.trim().slice(0, 120) }] : []));
      const reasons = Object.fromEntries(picked.filter((p) => p.reason).map((p) => [p.key, p.reason]));
      return { label: k.label, keys: picked.map((p) => p.key), ...(Object.keys(reasons).length ? { reasons } : {}) };
    }),
    items,
  );
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
    const reasons = g.reasons ? Object.fromEntries(same.filter((k) => g.reasons![k]).map((k) => [k, g.reasons![k]!])) : {};
    out.push({ label, keys: same, ...(Object.keys(reasons).length ? { reasons } : {}) });
  }
  return out;
}

function ruleGroups(query: string, items: ValueItem[]): ValueGroup[] {
  const relevant = items.filter((i) => isRelevant({ name: i.name, brand: i.brand || null, category: null }, query));
  const label = query.trim().charAt(0).toUpperCase() + query.trim().slice(1);
  return clean((["g", "ml", "und"] as const).map((u) => ({ label, keys: relevant.filter((i) => i.unit === u).map((i) => i.key) })), items);
}
