import type { RetailerClient, RetailerSlug } from "./types";
import { createVtexClient } from "./vtex";

export * from "./types";
export { createVtexClient } from "./vtex";

// robots.txt (checked 2026-10-26): D1 and Jumbo do not disallow /api/.
export const d1 = createVtexClient({
  slug: "d1",
  name: "D1",
  baseUrl: "https://www.d1.com.co",
  searchPath: "/api/catalog_system/pub/products/search",
  privateLabelPrefix: "7700304",
});

export const jumbo = createVtexClient({
  slug: "jumbo",
  name: "Jumbo",
  baseUrl: "https://www.jumbocolombia.com",
  searchPath: "/api/catalog_system/pub/products/search",
});

// Éxito disallows /api/ in robots.txt; its /api/ redirects to /io/api/, which we use.
// Enabled by product decision (2026-10-26); INGEST_EXITO=0 turns it off.
export const exito = createVtexClient({
  slug: "exito",
  name: "Éxito",
  baseUrl: "https://www.exito.com",
  searchPath: "/io/api/catalog_system/pub/products/search",
  // Éxito answers 429 at the 2 s default pace.
  minIntervalMs: 5000,
  // Éxito and Carulla are one backend (Grupo Éxito): a 429 at one is a 429 at both.
  rateGroup: "grupo-exito",
  // Marketplace sellers list here too; only Éxito's own price counts.
  ownSellerId: "1",
});

// Carulla shares Éxito's catalog (same SKUs and EANs) with its own prices. Its robots.txt disallows
// /api/ like Éxito's, and /api/ redirects to /io/api/. Always on, by product decision (2026-10-28).
export const carulla = createVtexClient({
  slug: "carulla",
  name: "Carulla",
  baseUrl: "https://www.carulla.com",
  searchPath: "/io/api/catalog_system/pub/products/search",
  minIntervalMs: 5000,
  rateGroup: "grupo-exito",
  ownSellerId: "1",
});

export const retailerBySlug: Record<RetailerSlug, RetailerClient> = { d1, jumbo, exito, carulla };

/** Stores Rinde ingests and offers, in display order. Éxito only when INGEST_EXITO=1; the rest always. */
export function enabledStores(env: Record<string, string | undefined> = process.env): RetailerSlug[] {
  return (["d1", "jumbo", "exito", "carulla"] as const).filter((s) => s !== "exito" || env["INGEST_EXITO"] === "1");
}

export function retailers(slugs: RetailerSlug[] = enabledStores()): RetailerClient[] {
  return slugs.map((s) => retailerBySlug[s]);
}
