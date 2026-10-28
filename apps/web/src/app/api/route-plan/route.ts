import { ndjsonStream } from "@/server/plan-service";
import { routePlanSchema, runRoutePlan, type RoutePlanEvent } from "@/server/route-plan";

// A plan around the store the person is going to. Streams NDJSON:
// {"type":"options"} → {"type":"advice"} or {"type":"question"} → {"type":"verified"}.
export async function POST(request: Request) {
  const parsed = routePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Elige tu tienda y cómo te mueves, e intenta de nuevo." }, { status: 400 });
  return ndjsonStream<RoutePlanEvent>((emit) => runRoutePlan(parsed.data, emit));
}
