import { z } from "zod";
import { valueGroups } from "@/server/value-groups";

const bodySchema = z.object({
  query: z.string().trim().min(2).max(100),
  products: z.array(z.object({
    key: z.string().max(80),
    name: z.string().max(200),
    brand: z.string().max(80),
    pack: z.number().min(0).max(1_000_000),
    unit: z.enum(["g", "ml", "und"]),
  })).max(60),
});

// Which search results are the same kind of product, brand aside, so the app can show the one that
// gives the most per peso. Takes names and sizes only; prices never go to the model.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "La búsqueda no es válida." }, { status: 400 });
  return Response.json(await valueGroups(parsed.data.query, parsed.data.products));
}
