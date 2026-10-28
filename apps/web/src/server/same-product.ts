import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { candidatesFor, parsePackageSize, pickSameProduct, type MatchItem } from "@rinde/core";
import { museJson, MuseUnavailable, museConfig, type MuseConfig } from "./muse";

const TTL_MS = 6 * 3_600_000;

export type SameProductVerdict<T> =
  /** The one candidate that is the same product (or none), and who decided */
  | { pick: T | null; by: "muse" | "rules"; reason: string | null; undecided?: false }
  /** Muse was unavailable and the strict rule couldn't tell: the store stays unchecked */
  | { pick: null; by: "rules"; reason: null; undecided: true };

const cache = new Map<string, { at: number; pickId: string | null; reason: string }>();

const sizeLabel = (i: MatchItem) => {
  const s = i.size ?? parsePackageSize(i.name);
  return s ? `${s.amount} ${s.unit === "unit" ? "und" : s.unit}` : "tamaño desconocido";
};
const describe = (i: MatchItem) => `${i.name}${i.brand ? ` · marca ${i.brand}` : ""} · ${sizeLabel(i)}`;

/**
 * Meta Muse decides which of another store's listings, if any, is the same product a shopper would
 * get: the same variety and form, whatever the store calls it ("Leche Deslact. ALPINA 1000ml").
 * It sees names, brands and sizes, never a price, and picks only among candidates that already
 * passed the size and brand checks; a pick that doesn't pass them again is thrown away. Without
 * Muse, the strict word rule decides, and when it can't, the store stays unchecked.
 */
export async function judgeSameProduct<T extends MatchItem>(target: MatchItem, listings: T[], cfg: MuseConfig = museConfig()): Promise<SameProductVerdict<T>> {
  const candidates = candidatesFor(target, listings);
  if (candidates.length === 0) return { pick: null, by: "muse", reason: null };

  const key = createHash("sha256").update(JSON.stringify([target.id, candidates.map((c) => c.id).sort()])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { pick: candidates.find((c) => c.id === hit.pickId) ?? null, by: "muse", reason: hit.reason };

  let answer: { pick: number; reason: string };
  try {
    answer = await ask(target, candidates, cfg);
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) throw e;
    const strict = pickSameProduct(target, candidates);
    return strict ? { pick: strict, by: "rules", reason: null } : { pick: null, by: "rules", reason: null, undecided: true };
  }
  const chosen = answer.pick >= 0 ? candidates[answer.pick] : undefined;
  // A slip that names a listing outside the list, or one that fails the size and brand checks, isn't a match.
  const pick = chosen && candidatesFor(target, [chosen]).length === 1 ? chosen : null;
  const reason = answer.reason.trim().slice(0, 200);
  cache.set(key, { at: Date.now(), pickId: pick?.id ?? null, reason });
  return { pick, by: "muse", reason };
}

async function ask(target: MatchItem, candidates: MatchItem[], cfg: MuseConfig) {
  const list = candidates.map((c, n) => `${n}: ${describe(c)}`).join("\n");
  const instruction = `A shopper in Colombia wants this exact product at another supermarket:
${describe(target)}

That supermarket lists the products below. Which one, if any, is the same product the shopper would get: the same brand, the same variety and form (for example whole, skim and lactose-free milk are different; plain and flavored are different), the same size? Stores abbreviate and reorder words ("Deslact." is "Deslactosada"), and some give products their own names, so judge what the product is, not the exact words.
Answer with the number of that product, or -1 if none is the same product. Give a one-line reason in Spanish a shopper understands, e.g. "Misma leche Alpina deslactosada de 1 L; la tienda la abrevia" or "Es leche semidescremada, no deslactosada".

${list}`;
  return museJson(
    instruction,
    {
      name: "same_product",
      schema: {
        type: "object", additionalProperties: false, required: ["pick", "reason"],
        properties: { pick: { type: "integer" }, reason: { type: "string" } },
      },
    },
    z.object({ pick: z.number().int(), reason: z.string() }),
    { effort: "low" },
    cfg,
  );
}
