import { z } from "zod";
import { decideTradeoff, ndjsonStream, runPlan } from "@/server/plan-service";

const bodySchema = z.object({ decision: z.enum(["accept", "reject"]) });

// Accept or reject a trade-off proposal, then re-plan (same NDJSON stream as POST /api/plan).
export async function POST(request: Request, ctx: RouteContext<"/api/plan/[basketId]/tradeoffs/[proposalId]">) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Indica si aceptas o rechazas la propuesta." }, { status: 400 });
  const { basketId, proposalId } = await ctx.params;

  return ndjsonStream(async (emit) => {
    const listId = await decideTradeoff(basketId, decodeURIComponent(proposalId), parsed.data.decision);
    emit({ type: "list", listId });
    await runPlan(listId, emit);
  });
}
