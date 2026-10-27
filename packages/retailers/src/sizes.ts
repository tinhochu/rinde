import { parseAmount, parsePackageSize, plausibleSize, type BaseUnit, type PackageSize } from "@rinde/core";

/** The subset of a VTEX product we read package sizes from. */
export interface VtexSizeSource {
  productName: string;
  /** D1 exposes structured specs, e.g. "Unidad De Medida": ["Gr"], "Valor de Medida": ["500"] */
  "Unidad De Medida"?: string[];
  "Valor de Medida"?: string[];
  /** Jumbo embeds a JSON blob with the size in kg / L as `unit_multiplier_un` */
  ProductData?: string[];
}

const D1_UNITS: Record<string, [BaseUnit, number]> = {
  gr: ["g", 1], g: ["g", 1], grs: ["g", 1], kg: ["g", 1000],
  ml: ["ml", 1], cc: ["ml", 1], lt: ["ml", 1000], l: ["ml", 1000],
  un: ["unit", 1], und: ["unit", 1], unidad: ["unit", 1],
};

/**
 * Resolve a product's package size: retailer metadata first, name parsing as fallback.
 * Verified against live responses on 2026-10-26 (see docs/data-feasibility.md).
 */
export function resolvePackageSize(p: VtexSizeSource): PackageSize | null {
  return d1Size(p) ?? jumboSize(p) ?? parsePackageSize(p.productName);
}

function d1Size(p: VtexSizeSource): PackageSize | null {
  const unit = D1_UNITS[p["Unidad De Medida"]?.[0]?.trim().toLowerCase() ?? ""];
  const raw = p["Valor de Medida"]?.[0]?.trim();
  if (!unit || !raw) return null;
  const size = { amount: round(parseAmount(raw, unit[1]) * unit[1]), unit: unit[0] };
  return plausibleSize(size) ? size : null;
}

// Jumbo's `unit_multiplier_un` is the net content in kg or L ("Arroz Roa x1kg" → 1,
// "Leche Colanta 6Und 900ml" → 5.4). Its unit label is unreliable (milk is tagged "gr"),
// so g vs ml comes from the name; the label is used only when the name has no unit.
function jumboSize(p: VtexSizeSource): PackageSize | null {
  let data: { unit_multiplier_un?: number; measurement_unit_un?: string };
  try {
    data = JSON.parse(p.ProductData?.[0] ?? "");
  } catch {
    return null;
  }
  const kiloAmount = Number(data.unit_multiplier_un);
  if (!(kiloAmount > 0)) return null;

  const fromName = parsePackageSize(p.productName);
  const unit: BaseUnit | null =
    fromName && fromName.unit !== "unit" ? fromName.unit
    : data.measurement_unit_un === "gr" ? "g"
    : data.measurement_unit_un === "ml" ? "ml"
    : null;
  const size = unit ? { amount: round(kiloAmount * 1000), unit } : null;
  return size && plausibleSize(size) ? size : null;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
