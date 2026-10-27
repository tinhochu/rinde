import { basketRequestSchema, priceBasket } from "@/server/basket";
import { enabledRetailers } from "@/server/offers";

// Re-price the saved basket now: each product at every store, and where each is cheapest.
export async function POST(request: Request) {
  const parsed = basketRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tu carrito no se pudo leer. Vuelve a agregar los productos." }, { status: 400 });
  return Response.json(await priceBasket(parsed.data, enabledRetailers()), { headers: { "Cache-Control": "no-store" } });
}
