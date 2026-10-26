import { findOffers } from "@/server/offers";
import { pricesRequestSchema, type LookupResult } from "@/server/contract";

// Look up observed offers for each shopping-list item across the enabled stores.
export async function POST(request: Request) {
  const parsed = pricesRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "La lista no es válida. Revisa los productos e intenta de nuevo." }, { status: 400 });

  const { area, items } = parsed.data;
  const rows = await Promise.all(
    items.map(async (item) => {
      const term = [item.name, item.allowSubstitution ? "" : item.brand].filter(Boolean).join(" ");
      const { offers, reasons } = await findOffers(term);
      return { item, offers, reasons };
    }),
  );

  return Response.json({ rows, checkedAt: new Date().toISOString(), area } satisfies LookupResult);
}
