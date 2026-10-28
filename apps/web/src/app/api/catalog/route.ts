import { z } from "zod";
import { compareProducts } from "@/server/compare";
import { enabledRetailers } from "@/server/offers";
import { SLUG_BY_STORE, type CatalogResult } from "@/server/contract";

const querySchema = z.object({
  query: z.string().trim().min(2).max(100),
  store: z.enum(["Éxito", "Jumbo", "D1", "Carulla"]).optional(),
});

// Browse observed offers for a search term, grouped into products compared across stores by EAN (or canonical produce item).
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Escribe al menos 2 letras para buscar." }, { status: 400 });

  const { query, store } = parsed.data;
  const stores = store ? [SLUG_BY_STORE[store]].filter((s) => enabledRetailers().includes(s)) : enabledRetailers();
  if (stores.length === 0) return Response.json({ offers: [], products: [], reasons: [`${store}: aún no comparamos esta tienda.`], checkedAt: new Date().toISOString() } satisfies CatalogResult);

  const { offers, products, reasons } = await compareProducts(query, stores);
  return Response.json({ offers, products, reasons, checkedAt: new Date().toISOString() } satisfies CatalogResult);
}
