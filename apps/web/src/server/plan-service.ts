import "server-only";
import { z } from "zod";
import {
  applyTradeoff, optimize, proposeTradeoffs, type Plan, type PlanItem, type PlanOptions, type Tradeoff,
} from "@rinde/core";
import { db, type RetailerSlug } from "@rinde/db";
import { candidatesFor, type ItemRequest } from "./candidates";
import { judgeKinds } from "./kind-judge";
import { listItemSchema } from "./contract";
import { liveDeps } from "./live";
import { enabledRetailers } from "./offers";
import { planAndVerify, type VerifyProgress } from "./verify";

export const createPlanSchema = z.union([
  z.object({ listId: z.string().min(1) }),
  z.object({
    budget: z.number().int().min(10_000).max(10_000_000),
    area: z.string().max(120).optional(),
    tripCost: z.number().int().min(0).max(100_000).optional(),
    items: z.array(listItemSchema.extend({ essential: z.boolean().optional() })).min(1).max(40),
  }),
]);
export type CreatePlanRequest = z.infer<typeof createPlanSchema>;

export type PlanEvent =
  | { type: "list"; listId: string }
  | VerifyProgress
  | { type: "plan"; basketId: string; listId: string; plan: Plan; variants: Plan[]; tradeoffs: Tradeoff[] }
  | { type: "error"; error: string };

/** Create a shopping list from the client's items (anonymous session). */
export async function createList(input: Exclude<CreatePlanRequest, { listId: string }>, sessionId: string) {
  const list = await db().shoppingList.create({
    data: {
      sessionId,
      budget: input.budget,
      city: input.area ?? "bogota",
      tripCost: input.tripCost ?? 10_000,
      items: {
        create: input.items.map((item, position) => ({
          rawText: item.name,
          query: item.name,
          brand: item.brand || null,
          quantity: item.quantity,
          unit: item.unit === "und" ? "unit" : item.unit,
          essential: item.essential ?? true,
          allowSubstitute: item.allowSubstitution,
          position,
        })),
      },
    },
  });
  return list.id;
}

export async function loadList(listId: string) {
  const list = await db().shoppingList.findUnique({
    where: { id: listId },
    include: { items: { orderBy: { position: "asc" } }, decisions: true },
  });
  if (!list) throw new PlanError("No encontramos esa lista.", 404);
  const requests: ItemRequest[] = list.items.map((i) => ({
    id: i.id,
    label: i.rawText,
    query: i.query,
    brand: i.brand,
    quantity: Number(i.quantity),
    unit: i.unit,
    essential: i.essential,
    allowSubstitute: i.allowSubstitute,
    pinnedListingId: i.pinnedListingId,
    dropped: i.dropped,
  }));
  const options: PlanOptions = {
    budget: list.budget,
    retailers: enabledRetailers(),
    tripCost: list.tripCost,
    forceStores: list.forceStores.length ? list.forceStores : undefined,
  };
  const rejected = new Set(list.decisions.filter((d) => d.decision === "reject").map((d) => d.proposalKey));
  return { list, requests, options, rejected };
}

/** Candidates → optimize → live verify → trade-offs → persist. Emits progress as it goes. */
export async function runPlan(listId: string, emit: (event: PlanEvent) => void) {
  const { requests, options, rejected } = await loadList(listId);
  const found: PlanItem[] = await Promise.all(requests.map((r) => candidatesFor(r, options.retailers as RetailerSlug[])));
  // Meta Muse keeps what each item really asks for, any brand or size, so the optimizer buys the most per peso.
  const items = await judgeKinds(found);
  const verified = await planAndVerify(items, options, liveDeps, { onProgress: emit });
  const tradeoffs = proposeTradeoffs(verified.items, options, verified.plan, rejected);
  const basketId = await saveBasket(listId, verified.plan, tradeoffs);
  // Full pick lists for the other stop counts, so the client can switch without a round trip.
  const variants = verified.plan.alternatives
    .filter((a) => !a.recommended)
    .map((a) => optimize(verified.items, { ...options, forceStores: a.retailers }));
  emit({ type: "plan", basketId, listId, plan: verified.plan, variants, tradeoffs });
}

async function saveBasket(listId: string, plan: Plan, tradeoffs: Tradeoff[]) {
  const lines = plan.stores.flatMap((s) => s.lines);
  const basket = await db().optimizedBasket.create({
    data: {
      listId,
      budget: plan.budget,
      total: plan.total,
      overBudget: plan.overBudget,
      stops: plan.stops,
      stores: plan.stores.map((s) => s.retailer),
      tripCost: plan.tripCost,
      baselineTotal: plan.baseline?.total ?? null,
      baselineDescription: plan.baseline?.description ?? null,
      savings: plan.savings,
      alternatives: plan.alternatives as object[],
      assumptions: { unavailable: plan.unavailable, droppedItemIds: plan.droppedItemIds, tradeoffs } as object,
      items: {
        create: lines.map((l) => ({
          listItemId: l.itemId,
          retailer: l.candidate.retailer,
          retailerProductId: l.candidate.listingId,
          priceObservationId: l.candidate.observationId ?? "",
          price: l.candidate.price,
          packs: l.packs,
          lineTotal: l.lineTotal,
          priceStatus: l.candidate.priceStatus,
          observedAt: new Date(l.candidate.observedAt),
          isSubstitute: l.isSubstitute,
          reason: l.reason,
        })),
      },
    },
  });
  return basket.id;
}

/** Record an accept/reject decision on a proposal from a saved basket, applying it on accept. */
export async function decideTradeoff(basketId: string, proposalKey: string, decision: "accept" | "reject") {
  const prisma = db();
  const basket = await prisma.optimizedBasket.findUnique({ where: { id: basketId } });
  if (!basket) throw new PlanError("No encontramos ese plan.", 404);
  const offered = ((basket.assumptions as { tradeoffs?: Tradeoff[] }).tradeoffs ?? []).find((t) => t.key === proposalKey);
  if (!offered) throw new PlanError("Esa propuesta ya no está disponible.", 404);

  await prisma.tradeoffDecision.upsert({
    where: { listId_proposalKey: { listId: basket.listId, proposalKey } },
    create: { listId: basket.listId, proposalKey, decision },
    update: { decision },
  });

  if (decision === "accept") {
    const { requests, options } = await loadList(basket.listId);
    // Apply to a minimal plan-item view, then persist the resulting list state.
    const asItems = requests.map((r) => ({ ...r, candidates: [] }));
    const next = applyTradeoff(asItems, options, offered.change);
    await prisma.$transaction([
      ...next.items.map((i) =>
        prisma.shoppingListItem.update({
          where: { id: i.id },
          data: { allowSubstitute: i.allowSubstitute, quantity: i.quantity, dropped: i.dropped ?? false },
        }),
      ),
      prisma.shoppingList.update({
        where: { id: basket.listId },
        data: { forceStores: next.options.forceStores ?? [] },
      }),
    ]);
  }
  return basket.listId;
}

export class PlanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** NDJSON stream: one JSON event per line. Errors become a final {"type":"error"} line. */
export function ndjsonStream<E extends { type: string } = PlanEvent>(run: (emit: (event: E | { type: "error"; error: string }) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: E | { type: "error"; error: string }) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await run(emit);
      } catch (error) {
        console.error("[plan]", error);
        emit({ type: "error", error: error instanceof PlanError ? error.message : "No pudimos armar el plan. Intenta de nuevo." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
