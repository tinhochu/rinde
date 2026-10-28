import { db } from "@rinde/db";
import { enabledRetailers } from "@/server/offers";
import { checkStores } from "@/server/store-check";

// "Buscar en todas las tiendas": check every store without a current price for this listing's product, live.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await db().retailerProduct.findUnique({ where: { id }, select: { id: true } }))) {
    return Response.json({ error: "No encontramos ese producto." }, { status: 404 });
  }
  return Response.json(await checkStores(id, enabledRetailers()), { headers: { "Cache-Control": "no-store" } });
}
