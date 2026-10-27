/** A carton of eggs as shoppers compare them: grade and how many, whatever the brand or shell color. */
export type Egg = { grade: string; count: number };

/** The listing fields egg recognition needs (see `ListingRow` in offers.ts). */
export type EggCandidate = { name: string; size: string | null; unit: "g" | "ml" | "unit" | null; category: string | null };

// Different products, not a grade of the same one: these keep their own cards.
const SPECIALTY = /libre|pastoreo|campesin|criollo|organic|dha|omega|azul|kosher|enriquecid|pasteuriz|liquid|cocid/;
const GRADES: Record<string, string> = { aaa: "AAA", aa: "AA", a: "A", b: "B", c: "C", l: "L", xl: "XL", jumbo: "Jumbo" };
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The grade and count of a carton of hen or quail eggs, when the listing states them unambiguously
 * ("Huevos AA rojos Nápoles x30und", "Huevo Tipo A Sol Naciente 30 Und"). Two grades in one name
 * ("A - AA", "Jumbo AA"), no grade, or a specialty egg (free-range, DHA…) gives undefined, so the
 * listing stays matched by barcode only.
 */
export function eggOf(r: EggCandidate): Egg | undefined {
  const name = plain(r.name);
  if (!/^huevos?\b/.test(name) || !/huevo/.test(plain(r.category ?? ""))) return undefined;
  if (SPECIALTY.test(name)) return undefined;

  // The count printed in the name beats the catalog size, which some stores fill in grams.
  const printed = /(?:\bx\s*|\b)(\d{1,3})\s*(?:und|unidades|u)\b/.exec(name);
  const count = printed ? Number(printed[1]) : r.unit === "unit" && r.size ? Number(r.size) : NaN;
  if (!Number.isInteger(count) || count < 1) return undefined;

  if (/\bcodorniz\b/.test(name)) return { grade: "codorniz", count };
  // A lone "a" is a grade only in capitals or after "tipo"; otherwise it may be the Spanish word.
  const words = r.name.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\s\-()/,.]+/);
  const grades = new Set<string>();
  words.forEach((w, i) => {
    const lower = w.toLowerCase();
    const grade = GRADES[lower];
    if (!grade) return;
    const afterTipo = words[i - 1]?.toLowerCase() === "tipo";
    if (lower.length === 1 && w !== w.toUpperCase() && !afterTipo) return;
    if ((lower === "l" || lower === "c") && !afterTipo && w !== w.toUpperCase()) return;
    grades.add(grade);
  });
  return grades.size === 1 ? { grade: [...grades][0]!, count } : undefined;
}

export const eggKey = (e: Egg) => `egg:${e.grade}:${e.count}`;

/** "Huevos tipo AA", "Huevos de codorniz", "Huevos jumbo". */
export function eggLabel(e: Egg) {
  if (e.grade === "codorniz") return "Huevos de codorniz";
  if (e.grade === "Jumbo") return "Huevos jumbo";
  return `Huevos tipo ${e.grade}`;
}
