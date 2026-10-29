import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { candidatesFor, parsePackageSize, pickSameProduct, type MatchItem } from "@rinde/core";
import { museJson, MuseUnavailable, museConfig, type MuseConfig } from "./muse";

const TTL_MS = 6 * 3_600_000;

export type SameProductVerdict<T> =
  /** The one candidate that is the same product (or none), and who decided */
  | { pick: T | null; by: "muse" | "rules"; reason: string | null; undecided?: false; unsure?: false }
  /** Muse was unavailable and the strict rule couldn't tell: the store stays unchecked */
  | { pick: null; by: "rules"; reason: null; undecided: true; unsure?: false }
  /** The names can't tell which listing it is (more than one could be): no price is shown for it */
  | { pick: null; by: "muse"; reason: string; undecided?: false; unsure: true };

/** Muse's answer when the names fit more than one listing. */
const UNSURE = -2;

const cache = new Map<string, { at: number; pickId: string | null; reason: string; unsure: boolean }>();

const sizeLabel = (i: MatchItem) => {
  const s = i.size ?? parsePackageSize(i.name);
  return s ? `${s.amount} ${s.unit === "unit" ? "und" : s.unit}` : "tamaño desconocido";
};
const describe = (i: MatchItem) => `${i.name}${i.brand ? ` · marca ${i.brand}` : ""} · ${sizeLabel(i)}`;

/**
 * Meta Muse decides which of another store's listings, if any, is the same product a shopper would
 * get: the same variety and form, whatever the store calls it ("Leche Deslact. ALPINA 1000ml").
 * It sees names, brands and sizes, never a price, and picks only among candidates that already
 * passed the size and brand checks; a pick that doesn't pass them again is thrown away. When the
 * names are too vague to tell which listing it is, Muse says so rather than guess (`unsure`). Without
 * Muse, the strict word rule decides, and when it can't, the store stays unchecked.
 */
export async function judgeSameProduct<T extends MatchItem>(target: MatchItem, listings: T[], cfg: MuseConfig = museConfig()): Promise<SameProductVerdict<T>> {
  const candidates = candidatesFor(target, listings);
  if (candidates.length === 0) return { pick: null, by: "muse", reason: null };

  const key = createHash("sha256").update(JSON.stringify([target.id, candidates.map((c) => c.id).sort()])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.unsure ? { pick: null, by: "muse", reason: hit.reason, unsure: true } : { pick: candidates.find((c) => c.id === hit.pickId) ?? null, by: "muse", reason: hit.reason };
  }

  let answer: { pick: number; reason: string };
  try {
    answer = await ask(target, candidates, cfg);
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) throw e;
    const strict = pickSameProduct(target, candidates);
    return strict ? { pick: strict, by: "rules", reason: null } : { pick: null, by: "rules", reason: null, undecided: true };
  }
  const reason = answer.reason.trim().slice(0, 200);
  // "Can't tell" needs two listings to choose between; with one, it is a yes or a no.
  if (answer.pick === UNSURE && candidates.length >= 2) {
    cache.set(key, { at: Date.now(), pickId: null, reason, unsure: true });
    return { pick: null, by: "muse", reason, unsure: true };
  }
  const chosen = answer.pick >= 0 ? candidates[answer.pick] : undefined;
  // A slip that names a listing outside the list, or one that fails the size and brand checks, isn't a match.
  const pick = chosen && candidatesFor(target, [chosen]).length === 1 ? chosen : null;
  cache.set(key, { at: Date.now(), pickId: pick?.id ?? null, reason, unsure: false });
  return { pick, by: "muse", reason };
}

async function ask(target: MatchItem, candidates: MatchItem[], cfg: MuseConfig) {
  const list = candidates.map((c, n) => `${n}: ${describe(c)}`).join("\n");
  const instruction = `A shopper in Colombia wants this exact product at another supermarket:
${describe(target)}

That supermarket lists the products below. Which one, if any, is the same product the shopper would get?
- Same brand. When no brand is given, read it from the name; a different brand is never the same product.
- Same variety, line, flavor, form and formula. Whole, skim and lactose-free milk are different; so are salted and unsalted butter, organic and regular, round and tablet panela, plain and flavored. A line or edition name (Premium, Vitaplus, Familia, Buenavista, Gold) in one listing and a different one in the other means different products.
- Same size (already checked).
- Same packaging when both names state it: milk in a bag (bolsa) and in a carton (caja, tetrapak) are different products, as are can and bottle, glass and plastic. Packaging named in only one listing is not a difference.
Stores abbreviate, reorder and describe the same product differently ("Deslact." is "Deslactosada", "S/A" is "sin azúcar"). Words that only describe it do not make it different: "esparcible", "pasteurizada", "tradicional", "clásico", "original", "tostado y molido". Judge what the product is, not the exact words; when a word in one name neither names a different product nor is contradicted by the other name, it is a description.
Answer with the number of that product, or -1 if none is the same product. Answer -2 only when the shopper's product name is too vague to tell which of two or more listings it is, each of which could be it (for example "Harina precocida" against a chickpea, a quinoa and a rice flour of that brand): a wrong guess would show the price of another product. Give a one-line reason in Spanish a shopper understands, e.g. "Misma leche Alpina deslactosada de 1 L; la tienda la abrevia", "Es leche semidescremada, no deslactosada" or "El nombre no dice si es de garbanzo, quinua o arroz".

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
