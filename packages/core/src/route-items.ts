import type { PlanLine } from "./optimizer";

/**
 * Which items of a route plan are cold or heavy, and where they go: cold and heavy things are picked
 * up at the last stop, so milk doesn't warm up and a 5 kg bag isn't carried between stores.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Fridge or freezer goods. Canned, powdered and long-life versions of the same foods are not.
const COLD = /congelad|helado|\bleche\b|yogur|kumis|queso|mantequilla|crema de leche|\bcarnes?\b|pollo|pescado|cerdo|\bres\b|salchich|jamon|chorizo|mortadela|marisco|camaron/;
const NOT_COLD = /\batun\b|\blata\b|enlatad|en polvo|\bpolvo\b|galleta|chocolat|arequipe|condensada/;

export function isCold(line: PlanLine): boolean {
  const text = norm(`${line.label} ${line.candidate.name}`);
  return COLD.test(text) && !NOT_COLD.test(text);
}

/** 2 kg or 2 L or more of one item, however many packs that is. */
export function isHeavy(line: PlanLine): boolean {
  const size = line.candidate.size;
  return !!size && size.unit !== "unit" && size.amount * line.packs >= 2000;
}

export interface StopItems<S> {
  stop: S;
  lines: PlanLine[];
}

/** How many cold and heavy lines a stop has; the stop with more goes last. */
export function coldHeavyScore(lines: PlanLine[]): number {
  return lines.filter((l) => isCold(l)).length * 2 + lines.filter((l) => isHeavy(l)).length;
}

/**
 * Within a stop, cold and heavy items last (picked up at the end of the visit), the rest in list order.
 * `order` is Muse's item order for the stop, used only when it names exactly the stop's items.
 */
export function orderLines(lines: PlanLine[], order?: string[]): PlanLine[] {
  if (order && order.length === lines.length) {
    const byLabel = new Map(lines.map((l) => [l.label, l]));
    const picked = order.map((label) => byLabel.get(label));
    if (picked.every(Boolean) && new Set(order).size === order.length) return picked as PlanLine[];
  }
  const weight = (l: PlanLine) => (isCold(l) ? 2 : 0) + (isHeavy(l) ? 1 : 0);
  return [...lines].sort((a, b) => weight(a) - weight(b));
}
