import { createList, createPlanSchema, ndjsonStream, runPlan } from "@/server/plan-service";

// Build a shopping plan. Streams NDJSON: {"type":"list"} → {"type":"progress"}… → {"type":"plan"}.
export async function POST(request: Request) {
  const parsed = createPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "La lista no es válida. Revisa los productos e intenta de nuevo." }, { status: 400 });

  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64) || crypto.randomUUID();
  const input = parsed.data;

  return ndjsonStream(async (emit) => {
    const listId = "listId" in input ? input.listId : await createList(input, sessionId);
    emit({ type: "list", listId });
    await runPlan(listId, emit);
  });
}
