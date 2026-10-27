import { z } from "zod";
import { confirmDraft, ReceiptRejected } from "@/server/receipts";

const editSchema = z.object({
  index: z.number().int().min(0).max(500),
  excluded: z.boolean().optional(),
  quantity: z.number().positive().max(10_000).optional(),
  unitPrice: z.number().int().positive().max(10_000_000).optional(),
  total: z.number().int().min(-10_000_000).max(10_000_000).optional(),
  listingId: z.string().max(40).optional(),
  noMatch: z.boolean().optional(),
});
// Header fields (store, date, total, invoice number) are not accepted: the receipt header is read-only.
const bodySchema = z.object({ lines: z.array(editSchema).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Los cambios no son válidos." }, { status: 400 });
  try {
    return Response.json(await confirmDraft({ sessionId, receiptId: (await params).id, edits: parsed.data.lines }));
  } catch (e) {
    if (e instanceof ReceiptRejected) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
