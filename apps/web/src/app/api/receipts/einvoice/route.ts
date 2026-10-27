import { db } from "@rinde/db";
import { EINVOICE_MESSAGES, intakeInvoiceFiles } from "@/server/einvoice";
import { resultsJson, summarize } from "@/server/inbox";
import { sha256 } from "@/server/muse";
import { contributorFor } from "@/server/receipts";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Upload the e-invoice file (multipart: file, zone) → the draft, through the same intake as a forwarded email.
export async function POST(request: Request) {
  const sessionId = request.headers.get("x-rinde-session")?.slice(0, 64);
  if (!sessionId) return Response.json({ error: "Falta la sesión. Cierra y abre la app." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: EINVOICE_MESSAGES.type, code: "type" }, { status: 400 });
  if (!/\.(zip|xml|pdf)$/i.test(file.name)) return Response.json({ error: EINVOICE_MESSAGES.type, code: "type" }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "El archivo pesa más de 10 MB.", code: "size" }, { status: 413 });

  const zone = form?.get("zone");
  const contributor = await contributorFor(sessionId, typeof zone === "string" && zone ? zone.slice(0, 60) : undefined);
  const data = new Uint8Array(await file.arrayBuffer());
  const outcomes = await intakeInvoiceFiles({ contributor, files: [{ name: file.name, data }], via: "upload" });
  const summary = summarize(outcomes);
  await db().invoiceIntake.create({
    data: {
      contributorId: contributor.id, via: "upload", status: summary.status, message: summary.message, receiptId: summary.receiptId,
      store: summary.store, results: resultsJson(outcomes), fileHashes: [sha256(data)],
    },
  });

  const accepted = outcomes.find((o) => o.status === "accepted");
  if (accepted?.status === "accepted") return Response.json(accepted.draft);
  const refused = outcomes[0]!;
  return refused.status === "rejected"
    ? Response.json({ error: refused.message, code: refused.code }, { status: refused.httpStatus })
    : Response.json(refused.draft);
}
