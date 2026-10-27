import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { museJson, museConfig, type MuseConfig } from "./muse";

export type PhotoListItem = { id: string; name: string; quantity: number; unit: "g" | "ml" | "und"; brand: string; allowSubstitution: boolean };

const INSTRUCTION = `This photo shows a shopping list someone in Colombia wrote by hand or printed. Read every product on it.
For each one give the product as written in plain Spanish (fix obvious misspellings, drop bullets and ticks), the amount and unit, and a brand only if one is written.
Convert amounts: kilos or libras to grams (1 libra = 500 g), litros to ml; anything counted (huevos, panes, latas, paquetes) is "und". With no amount written, use 1 und.
Never invent products that are not written, and never give prices. If the photo is not a shopping list, return no items.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "quantity", "unit", "brand"],
        properties: {
          name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: ["g", "ml", "und"] }, brand: { type: "string" },
        },
      },
    },
  },
} as const;

const result = z.object({
  items: z.array(z.object({ name: z.string(), quantity: z.number(), unit: z.enum(["g", "ml", "und"]), brand: z.string() })),
});

/** Reads a photographed shopping list into list items with Meta Muse vision. Items only: never prices. */
export async function readListPhoto(image: { data: Uint8Array; mime: string }, cfg: MuseConfig = museConfig()): Promise<PhotoListItem[]> {
  const out = await museJson(INSTRUCTION, { name: "shopping_list", schema: SCHEMA }, result, { image, effort: "low" }, cfg);
  return out.items
    .map((i) => ({ name: i.name.trim().slice(0, 100), quantity: i.quantity, unit: i.unit, brand: i.brand.trim().slice(0, 80) }))
    .filter((i) => i.name.length >= 2 && i.quantity > 0 && i.quantity <= 1_000_000)
    .slice(0, 20)
    .map((i) => ({ id: randomUUID(), ...i, allowSubstitution: true }));
}
