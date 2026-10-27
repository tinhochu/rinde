import { z } from "zod";
import { HISTORY_DAYS, priceHistory } from "@/server/history";

const idsSchema = z.array(z.string().min(1).max(150)).min(1).max(6);

// Observed prices for a product's listings (one per store) over the last 30 days. No interpolation.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const parsed = idsSchema.safeParse(raw.split(",").map((s) => s.trim()).filter(Boolean));
  if (!parsed.success) return Response.json({ error: "No pudimos leer el producto." }, { status: 400 });
  const points = await priceHistory(parsed.data);
  return Response.json({ days: HISTORY_DAYS, points }, { headers: { "Cache-Control": "no-store" } });
}
