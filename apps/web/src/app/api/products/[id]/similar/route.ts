import { db } from "@rinde/db";
import { enabledRetailers } from "@/server/offers";
import { similarProducts } from "@/server/similar";

// "Similares": other products of the same kind as this listing's product, ranked by price per unit.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await db().retailerProduct.findUnique({ where: { id }, select: { id: true } }))) {
    return Response.json({ error: "No encontramos ese producto." }, { status: 404 });
  }
  return Response.json({ products: await similarProducts(id, enabledRetailers()), checkedAt: new Date().toISOString() });
}
