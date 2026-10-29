import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { candidatesFor, parsePackageSize, pickSameProduct, type MatchItem } from "@rinde/core";
import { museJson, MuseUnavailable, museConfig, type MuseConfig } from "./muse";

const TTL_MS = 6 * 3_600_000;

/** A listing with the store's product photo, when it has one. */
export type Pictured = MatchItem & { imageUrl?: string | null };

/**
 * When Muse also looks at the product photos: "unsure" asks again with photos only when the names
 * alone can't tell; "multi" (the default) looks whenever two or more listings could be it; "always"
 * looks every time. See eval/TUNING.md for how each did.
 */
export type PhotoMode = "never" | "unsure" | "multi" | "always";

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
 * two or more listings could be it, Muse also sees the stores' product photos; when names and photos
can't tell which listing it is, it says so rather than guess (`unsure`). Without
 * Muse, the strict word rule decides, and when it can't, the store stays unchecked.
 */
export async function judgeSameProduct<T extends Pictured>(
  target: Pictured, listings: T[], cfg: MuseConfig = museConfig(),
  opts: { photos?: PhotoMode; fetchPhoto?: (url: string) => Promise<Photo | null> } = {},
): Promise<SameProductVerdict<T>> {
  const mode = opts.photos ?? "multi";
  const candidates = candidatesFor(target, listings);
  if (candidates.length === 0) return { pick: null, by: "muse", reason: null };

  const key = createHash("sha256").update(JSON.stringify([target.id, candidates.map((c) => c.id).sort()])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.unsure ? { pick: null, by: "muse", reason: hit.reason, unsure: true } : { pick: candidates.find((c) => c.id === hit.pickId) ?? null, by: "muse", reason: hit.reason };
  }

  let answer: { pick: number; reason: string };
  try {
    const looks = mode === "always" || (mode === "multi" && candidates.length >= 2);
    const photos = looks ? await photosOf(target, candidates, opts.fetchPhoto) : null;
    answer = await ask(target, candidates, cfg, photos);
    // The names can't tell: the package in each photo often can (bag or carton, the flour on the label).
    if (answer.pick === UNSURE && candidates.length >= 2 && mode === "unsure") {
      const later = await photosOf(target, candidates, opts.fetchPhoto);
      // If that second look fails, the first answer ("not sure") stands.
      if (later) answer = await ask(target, candidates, cfg, later).catch((e: unknown) => { if (e instanceof MuseUnavailable) return answer; throw e; });
    }
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

type Photo = { data: Uint8Array; mime: string };
/** Photos in the order Muse sees them, and which item each one shows ("A" is the shopper's product). */
type Photos = { images: Photo[]; labels: string[] };

const PHOTO_TIMEOUT_MS = 4_000;
const PHOTO_MAX_BYTES = 400_000;
const photoCache = new Map<string, Promise<Photo | null>>();

/** A store's own product photo, made small by the store's image server. Only the stores' VTEX image hosts. */
export function fetchStorePhoto(url: string): Promise<Photo | null> {
  let u: URL;
  try { u = new URL(url); } catch { return Promise.resolve(null); }
  if (u.protocol !== "https:" || !/\.(vteximg\.com\.br|vtexassets\.com)$/.test(u.hostname)) return Promise.resolve(null);
  u.pathname = u.pathname.replace(/\/arquivos\/ids\/(\d+)(?:-\d+-\d+)?\//, "/arquivos/ids/$1-400-400/");
  const key = u.toString();
  let hit = photoCache.get(key);
  if (!hit) {
    if (photoCache.size > 2_000) photoCache.clear();
    hit = (async () => {
      try {
        const res = await fetch(key, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
        const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
        if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return null;
        const data = new Uint8Array(await res.arrayBuffer());
        return data.byteLength <= PHOTO_MAX_BYTES ? { data, mime } : null;
      } catch {
        return null;
      }
    })();
    photoCache.set(key, hit);
  }
  return hit;
}

/** Photos of the shopper's product and the candidates; null when there's nothing to compare (no photo of A, or of no candidate). */
async function photosOf(target: Pictured, candidates: Pictured[], fetchPhoto = fetchStorePhoto): Promise<Photos | null> {
  const got = await Promise.all([target, ...candidates].map((i) => (i.imageUrl ? fetchPhoto(i.imageUrl) : Promise.resolve(null))));
  if (!got[0] || got.slice(1).every((p) => !p)) return null;
  const photos: Photos = { images: [], labels: [] };
  got.forEach((p, n) => { if (p) { photos.images.push(p); photos.labels.push(n === 0 ? "A" : String(n - 1)); } });
  return photos;
}

async function ask(target: MatchItem, candidates: MatchItem[], cfg: MuseConfig, photos: Photos | null = null) {
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

${list}${photos ? `

The stores' product photos follow, in this order: ${photos.labels.map((l) => (l === "A" ? "the shopper's product" : `listing ${l}`)).join(", ")}${photos.labels.length < candidates.length + 1 ? " (the others have no photo)" : ""}.
Read each package: the variety, flavor, line and packaging printed or shown on it count as much as the name. Two stores can photograph one product differently (angle, background, an older label edition): judge what each package says the product is. A store photo can be a generic picture; when the photos don't settle it either, answer -2 as above.` : ""}`;
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
    { effort: "low", ...(photos ? { images: photos.images } : {}) },
    cfg,
  );
}
