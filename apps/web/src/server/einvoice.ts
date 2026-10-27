import "server-only";
import {
  dianValidationOk, EInvoiceError, invoiceStore, invoiceToReceiptInput, openInvoiceFiles, parseDianDocument, type InvoiceFile,
} from "@rinde/core/einvoice";
import { sha256 } from "./muse";
import { renderPdfPages } from "./pdf";
import { draftFromInput, draftFromPhotos, MESSAGES, ReceiptRejected, type ReceiptDraft } from "./receipts";

/** E-invoice refusals, shown verbatim (einvoice-intake spec). */
export const EINVOICE_MESSAGES = {
  type: "Sube el archivo .zip, .xml o .pdf de tu factura electrónica.",
  unreadable: "No pudimos abrir el archivo de la factura.",
  not_invoice: "Este documento no es una factura de compra.",
  unvalidated: "No pudimos validar esta factura electrónica.",
  missing: "No encontramos la factura electrónica en el correo. Reenvía el correo que trae el archivo .zip.",
  pdf: "No pudimos leer el PDF. Reenvía el correo con el archivo .zip de la factura.",
  flood: "Recibimos demasiados correos en esta dirección hoy.",
  elsewhere: "Abre Rinde en el celular donde reenviaste la factura.",
} as const;

export type IntakeOutcome =
  | { status: "accepted"; draft: ReceiptDraft }
  | { status: "rejected"; code: string; message: string; httpStatus: number };

/** One attachment or uploaded file, in memory only. */
export type IncomingFile = { name: string; data: Uint8Array };

const rejected = (code: string, message: string, httpStatus = 422): IntakeOutcome => ({ status: "rejected", code, message, httpStatus });

function refusal(e: unknown): IntakeOutcome {
  if (e instanceof EInvoiceError) return rejected(e.code, EINVOICE_MESSAGES[e.code], e.code === "type" ? 415 : 422);
  if (e instanceof ReceiptRejected) return rejected(e.code, e.message, e.status);
  throw e;
}

type Submitter = { id: string; suspendedUntil: Date | null };

/** One XML invoice → a draft, or the reason it can't be one. */
async function fromXml(contributor: Submitter, file: InvoiceFile, now: Date): Promise<IntakeOutcome> {
  try {
    const doc = parseDianDocument(file.data);
    if (!dianValidationOk(doc)) throw new EInvoiceError("unvalidated", "no matching DIAN validation");
    const store = invoiceStore(doc.supplierNit, doc.banner, doc.branchAddress);
    if (!store) return rejected("store", MESSAGES.store);
    const input = invoiceToReceiptInput(doc);
    const draft = await draftFromInput(contributor, {
      ...input, store, source: "einvoice", demo: false, fileHash: sha256(file.data),
    }, now);
    return { status: "accepted", draft };
  } catch (e) {
    return refusal(e);
  }
}

/** The PDF alone: its pages go through the photo extraction, under the photo rules. */
async function fromPdf(contributor: Submitter, file: InvoiceFile, now: Date): Promise<IntakeOutcome> {
  let pages: { data: Uint8Array; mime: string }[];
  try {
    pages = await renderPdfPages(file.data);
  } catch {
    return rejected("pdf", EINVOICE_MESSAGES.pdf, 503);
  }
  try {
    const draft = await draftFromPhotos({ contributor, photos: pages, source: "einvoice-pdf", fileHash: sha256(file.data), now });
    return { status: "accepted", draft };
  } catch (e) {
    // The model being down or slow reads as "we couldn't read the PDF", with the way out.
    if (e instanceof ReceiptRejected && ["unavailable", "long", "slow"].includes(e.code)) return rejected("pdf", EINVOICE_MESSAGES.pdf, 503);
    return refusal(e);
  }
}

/**
 * The one intake path behind both doors (email and upload): open every file, prefer the XML over the
 * PDF, and turn each invoice into a draft through the shared receipt pipeline. Files live only in
 * memory here and are dropped when this returns; buyer data is never read from them.
 * Returns one outcome per invoice found, or a single rejection when there is none.
 */
export async function intakeInvoiceFiles(input: {
  contributor: Submitter; files: IncomingFile[]; via: "email" | "upload"; now?: Date;
}): Promise<IntakeOutcome[]> {
  const now = input.now ?? new Date();
  const opened: InvoiceFile[] = [];
  const failures: IntakeOutcome[] = [];
  for (const file of input.files) {
    try {
      opened.push(...openInvoiceFiles(file.data, file.name));
    } catch (e) {
      failures.push(refusal(e));
    }
  }
  const xmls = opened.filter((f) => f.kind === "xml");
  // When the XML is there, the PDF is the same invoice printed: it is never read.
  const invoices = xmls.length ? xmls : opened.filter((f) => f.kind === "pdf");
  if (invoices.length === 0) return failures.length ? failures : [rejected("missing", EINVOICE_MESSAGES.missing)];

  const outcomes: IntakeOutcome[] = [];
  const seen = new Set<string>();
  for (const file of invoices) {
    const hash = sha256(file.data);
    if (seen.has(hash)) continue;
    seen.add(hash);
    outcomes.push(file.kind === "xml" ? await fromXml(input.contributor, file, now) : await fromPdf(input.contributor, file, now));
  }
  return outcomes;
}
