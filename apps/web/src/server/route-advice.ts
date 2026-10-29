import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  STORE_NAMES, formatCop, formatDistance, formatMinutes, isCold, isHeavy, type RouteOption, type TravelMode,
} from "@rinde/core";
import { museJson, MuseUnavailable, museConfig, type MuseConfig } from "./muse";

/**
 * Muse looks at the route plan's options (computed from stored prices and street routes) and the
 * person's situation, picks one and says why in plain Spanish. It never computes a number: every
 * figure in its explanation must be one it was given, or the rule's pick and a fixed text are used.
 */

/** The rule: the largest net saving, when it's at least this much and this share of the anchor-only total. */
export const MIN_NET = 3000;
export const MIN_SHARE = 0.05;
const TTL_MS = 6 * 3_600_000;
const cache = new Map<string, { at: number; advice: RouteAdvice }>();

export interface RouteAdvice {
  source: "muse" | "rule";
  /** Index into the options */
  choice: number;
  explanation: string;
  /** A follow-up Muse asks when a missing fact would change the choice; `choice` is then the rule's */
  question: string | null;
  /** Item labels per stop of the chosen option, in the order to pick them up (when Muse gave a valid one) */
  itemOrder: Map<number, string[]>;
  /** When staying at the anchor: what the best extra stop would have saved */
  foregone: { label: string; net: number } | null;
}

const MODE: Record<TravelMode, string> = { walk: "a pie", bus: "en bus o TransMilenio", moto: "en moto", car: "en carro" };

export function ruleChoice(options: RouteOption[]): number {
  const anchorTotal = options[0]?.goodsTotal ?? 0;
  let best = 0;
  options.forEach((o, i) => {
    if (i > 0 && o.net >= MIN_NET && o.net >= anchorTotal * MIN_SHARE && o.net > (best ? options[best]!.net : 0)) best = i;
  });
  return best;
}

function foregone(options: RouteOption[], choice: number) {
  if (choice !== 0) return null;
  const best = options.slice(1).sort((a, b) => b.net - a.net)[0];
  return best && best.net > 0 ? { label: otherStore(options, best), net: best.net } : null;
}

/** The chain an option adds to the anchor (options[0] is the anchor alone). */
const otherStore = (options: RouteOption[], o: RouteOption) => {
  const anchor = options[0]!.stops[0]!.chain;
  return STORE_NAMES[o.stops.find((s) => s.chain !== anchor)!.chain];
};

/** Fixed text for the rule's pick, from the same figures. */
export function ruleExplanation(options: RouteOption[], choice: number, mode: TravelMode): string {
  const anchor = STORE_NAMES[options[0]!.stops[0]!.chain];
  if (choice > 0) {
    const o = options[choice]!;
    const cost = o.travelCost > 0 ? `, ya descontados ${formatCop(o.travelCost)} del trayecto` : "";
    return `Pasar por ${otherStore(options, o)} te ahorra ${formatCop(o.net)}${cost}, por ${formatMinutes(o.extra.durationS)} más ${MODE[mode]}.`;
  }
  const lost = foregone(options, 0);
  return lost
    ? `Compra todo en tu ${anchor}: pasar por ${lost.label} solo te ahorraría ${formatCop(lost.net)}.`
    : `Compra todo en tu ${anchor}: ninguna tienda cercana te ahorra en esta lista.`;
}

interface Figures {
  pesos: Set<number>;
  minutes: Set<number>;
  meters: Set<number>;
  plain: Set<number>;
}

/** What Muse is told, as text, and every figure in it. */
export function describeOptions(options: RouteOption[], mode: TravelMode) {
  const f: Figures = { pesos: new Set(), minutes: new Set(), meters: new Set(), plain: new Set() };
  const peso = (n: number) => { f.pesos.add(Math.round(n)); return formatCop(n); };
  const mins = (s: number) => { const t = formatMinutes(s); f.minutes.add(Number(t.split(" ")[0])); return t; };
  const dist = (m: number) => { const t = formatDistance(m); f.meters.add(metersOf(t)!); return t; };
  const count = (n: number) => { f.plain.add(n); return String(n); };

  const blocks = options.map((o, i) => {
    const stops = o.stops.map((s, n) => {
      const lines = o.stopLines[n] ?? [];
      const tagged = lines.map((l) => `${l.label}${isCold(l) ? " (frío)" : ""}${isHeavy(l) ? " (pesado)" : ""}`);
      for (const l of lines) for (const m of l.label.match(/\d+(?:[.,]\d+)?/g) ?? []) f.plain.add(Number(m.replace(",", ".")));
      return `   Parada ${count(n + 1)}: ${s.branch?.name ?? STORE_NAMES[s.chain]}${s.branch?.area ? ` (${s.branch.area})` : ""} — ${count(lines.length)} productos: ${tagged.join(", ") || "ninguno"}`;
    });
    const head = i === 0
      ? `Opción ${count(i)}: ${o.label}. Total de la compra ${peso(o.goodsTotal)}.`
      : `Opción ${count(i)}: ${o.label}. Ahorro en productos ${peso(o.saving)}; trayecto extra ${dist(o.extra.distanceM)} y ${mins(o.extra.durationS)} ${o.walkBetween ? "a pie entre las tiendas" : MODE[mode]}; costo del trayecto ${peso(o.travelCost)}; ahorro neto ${peso(o.net)}.` +
        (o.extraItems.length ? ` Además consigue ${count(o.extraItems.length)} productos que tu tienda no tiene.` : "");
    return [head, ...stops].join("\n");
  });
  return { text: blocks.join("\n\n"), figures: f };
}

function metersOf(token: string): number | null {
  const m = token.match(/(\d+(?:[.,]\d+)?)\s*(km|kilómetros?|kilometros?|m|metros?)\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return /^k/i.test(m[2]!) ? Math.round(n * 1000) : Math.round(n);
}

/** Every number in the explanation must be one of the given figures, of the same kind. */
export function usesOnlyGivenFigures(explanation: string, f: Figures): boolean {
  let rest = explanation;
  for (const m of explanation.matchAll(/\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g)) {
    if (!f.pesos.has(Number(m[1]!.replace(/\./g, "")))) return false;
    rest = rest.replace(m[0], " ");
  }
  for (const m of rest.matchAll(/(\d+)\s*(?:min\b|minutos?)/gi)) {
    if (!f.minutes.has(Number(m[1]))) return false;
    rest = rest.replace(m[0], " ");
  }
  for (const m of rest.matchAll(/\d+(?:[.,]\d+)?\s*(?:km|kilómetros?|kilometros?|metros?|m)\b/gi)) {
    const meters = metersOf(m[0])!;
    // A distance said either way ("1,2 km" or "1.200 m") is the same figure, within the rounding shown.
    if (![...f.meters].some((g) => Math.abs(g - meters) <= Math.max(10, g * 0.05))) return false;
    rest = rest.replace(m[0], " ");
  }
  const all = new Set([...f.pesos, ...f.minutes, ...f.meters, ...f.plain]);
  for (const m of rest.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (!all.has(Number(m[0].replace(",", ".")))) return false;
  }
  return true;
}

const answerSchema = z.object({
  choice: z.number().int().nullable(),
  question: z.string().max(160).nullable(),
  explanation: z.string().max(400),
  itemOrder: z.array(z.object({ stop: z.number().int(), items: z.array(z.string()) })),
});

export async function adviseRoute(
  options: RouteOption[],
  travel: { mode: TravelMode },
  note: string,
  opts: { allowQuestion?: boolean } = {},
  cfg: MuseConfig = museConfig(),
): Promise<RouteAdvice> {
  const rule = ruleChoice(options);
  const fallback: RouteAdvice = {
    source: "rule", choice: rule, explanation: ruleExplanation(options, rule, travel.mode), question: null,
    itemOrder: new Map(), foregone: foregone(options, rule),
  };
  if (options.length < 2) return fallback;

  const cleanNote = note.replace(/\s+/g, " ").trim().slice(0, 200);
  const { text, figures } = describeOptions(options, travel.mode);
  const allowQuestion = opts.allowQuestion ?? true;
  const key = createHash("sha256").update(JSON.stringify([text, cleanNote, travel.mode, allowQuestion])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.advice;

  const instruction = `Una persona en Colombia va a hacer mercado en su tienda de siempre y quiere saber si vale la pena pasar también por otra tienda cercana.
Va ${MODE[travel.mode]}.${cleanNote ? ` Nota de la persona: "${cleanNote}".` : " No dejó ninguna nota."}

Estas son las opciones, ya calculadas con precios y rutas reales. No calcules ni cambies ningún número.

${text}

Elige la opción que más le conviene a esta persona, pensando en su situación: el tiempo, ir cargada o a pie, productos fríos o pesados, si el ahorro neto justifica el desvío.
- "choice": el número de la opción elegida.
- "explanation": máximo dos frases en español sencillo, de tú, diciendo por qué. Usa solo números que aparecen arriba, escritos igual (por ejemplo $12.300, 8 min, 600 m). No inventes ni redondees cifras.
- "itemOrder": para cada parada de la opción elegida ("stop" desde 1), los productos en el orden en que conviene tomarlos: los fríos y pesados al final. Usa los nombres exactos de la lista.
- "question": ${allowQuestion ? "si te falta un dato que cambiaría la decisión (por ejemplo si va en carro o a pie con bebé), una sola pregunta corta de sí o no; si no, null. Si preguntas, \"choice\" puede ser null." : "siempre null."}`;

  try {
    const answer = await museJson(
      instruction,
      {
        name: "route_advice",
        schema: {
          type: "object", additionalProperties: false, required: ["choice", "question", "explanation", "itemOrder"],
          properties: {
            choice: { type: ["integer", "null"] },
            question: { type: ["string", "null"] },
            explanation: { type: "string" },
            itemOrder: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["stop", "items"],
                properties: { stop: { type: "integer" }, items: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
      },
      answerSchema,
      { effort: "low" },
      cfg,
    );
    const advice = accept(answer, options, figures, allowQuestion, fallback);
    cache.set(key, { at: Date.now(), advice });
    return advice;
  } catch (e) {
    if (!(e instanceof MuseUnavailable)) console.error("[route-advice]", e);
    return fallback;
  }
}

function accept(
  answer: z.infer<typeof answerSchema>, options: RouteOption[], figures: Figures, allowQuestion: boolean, fallback: RouteAdvice,
): RouteAdvice {
  if (allowQuestion && answer.question?.trim()) {
    return { ...fallback, question: answer.question.trim() };
  }
  const choice = answer.choice;
  if (choice === null || choice < 0 || choice >= options.length) return fallback;
  const explanation = answer.explanation.trim();
  if (!explanation || !usesOnlyGivenFigures(explanation, figures)) return fallback;
  const chosen = options[choice]!;
  const itemOrder = new Map<number, string[]>();
  for (const { stop, items } of answer.itemOrder) {
    const labels = chosen.stopLines[stop - 1]?.map((l) => l.label);
    // Only an exact reordering of that stop's items counts.
    if (labels && items.length === labels.length && [...items].sort().join("\n") === [...labels].sort().join("\n")) itemOrder.set(stop - 1, items);
  }
  return { source: "muse", choice, explanation, question: null, itemOrder, foregone: foregone(options, choice) };
}
