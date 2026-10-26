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
});

export function retailers(opts: { includeExito?: boolean } = {}): RetailerClient[] {
  return opts.includeExito ? [d1, jumbo, exito] : [d1, jumbo];
}

export const retailerBySlug: Record<RetailerSlug, RetailerClient> = { d1, jumbo, exito };
