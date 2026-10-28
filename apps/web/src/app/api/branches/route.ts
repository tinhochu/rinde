import { branchQuerySchema, findBranches } from "@/server/branches";

// GET /api/branches?q=D1 Chapinero  or  ?near=4.65,-74.06&chain=d1&mode=walk
// Branches from OpenStreetMap; with `near`, sorted by route time and with route distance and minutes.
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = branchQuerySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Busca por nombre o barrio, o comparte tu ubicación." }, { status: 400 });
  const result = await findBranches(parsed.data);
  return Response.json({ ...result, attribution: "© OpenStreetMap contributors" }, { headers: { "Cache-Control": "no-store" } });
}
