import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@rinde/core";
import { db, ensureRetailer } from "@rinde/db";

// The model is mocked: the XML path never calls it; the PDF fallback reads through it like a photo.
const muse = vi.hoisted(() => ({ extraction: null as Extraction | null, calls: 0, photos: 0, down: false }));
vi.mock("./muse", async (orig) => {
  const actual = await orig<typeof import("./muse")>();
  return {
    ...actual,
    extractReceipt: async (images: unknown[]) => {
      muse.calls++;
      muse.photos = images.length;
      if (muse.down) throw new actual.MuseUnavailable("mocked outage");
      return { extraction: structuredClone(muse.extraction!), demo: false };
    },
    chooseCandidates: async () => { throw new actual.MuseUnavailable("mocked"); },
  };
});
vi.stubEnv("RECEIPTS_DIR", "/tmp/rinde-receipts-test");

const { intakeInvoiceFiles, EINVOICE_MESSAGES } = await import("./einvoice");
const { confirmDraft, createDraft, contributorFor, MESSAGES } = await import("./receipts");
const { searchSnapshot } = await import("./offers");
const { cleanupContributors } = await import("./receipt-fixture");

const RUN = `test-einv-${Date.now()}`;
const session = (n: string) => `${RUN}-${n}`;
const FIXTURES = path.join(import.meta.dirname, "../../../../packages/core/src/einvoice/fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");
const ORIGINAL_CUFE = /0d87f960718cc4c279feec708b35a4d298d8bbc88b339cc9d6d23327b73c9c81731ecca8117f49e60ad9116aca3eecf4/g;

let seq = 0;
/** A fixture as if issued `hoursAgo` hours ago, with its own invoice number and CUFE (in the invoice and in the DIAN response). */
function fresh(name: string, hoursAgo = 2) {
  const n = ++seq;
  const cufe = createHash("sha384").update(`${RUN}-${n}`).digest("hex");
  const local = new Date(Date.now() - hoursAgo * 3_600_000 - n * 60_000 - 5 * 3_600_000).toISOString();
  const xml = fixture(name)
    .replace(ORIGINAL_CUFE, cufe)
    .replaceAll("QZ9667377", `QZ96${RUN.slice(-7)}${n}`)
    .replaceAll("<cbc:IssueDate>2026-10-26</cbc:IssueDate><cbc:IssueTime>18:19:19-05:00</cbc:IssueTime>",
      `<cbc:IssueDate>${local.slice(0, 10)}</cbc:IssueDate><cbc:IssueTime>${local.slice(11, 19)}-05:00</cbc:IssueTime>`);
  return { xml, cufe, file: { name: `ad${n}.xml`, data: strToU8(xml) } };
}
const asZip = (xml: string) => ({ name: "factura.zip", data: zipSync({ "ad0890.xml": strToU8(xml), "fv0890.pdf": strToU8("%PDF-1.4 not read") }) });

/** A one-page PDF with no text; MuPDF renders it blank. */
const PDF = strToU8("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function intake(name: string, files: { name: string; data: Uint8Array }[]) {
  const contributor = await contributorFor(session(name));
  return intakeInvoiceFiles({ contributor, files, via: "upload" });
}

describe.skipIf(!process.env["INTEGRATION"])("e-invoice intake (dev DB)", () => {
  beforeEach(() => { muse.calls = 0; muse.down = false; });
  afterAll(() => cleanupContributors(RUN));

  it("turns the Éxito invoice into a DIAN-confirmed draft whose lines pass their checks, without the model", async () => {
    const { xml, cufe } = fresh("exito.xml");
    const [outcome] = await intake("a", [asZip(xml)]);
    expect(outcome!.status).toBe("accepted");
    const draft = (outcome as { draft: import("./receipts").ReceiptDraft }).draft;
    expect(draft).toMatchObject({ store: "Éxito", branch: "ÉXITO LAURELES", total: 16100, source: "einvoice", dianConfirmed: true, cufe });
    expect(draft.lines.map((l) => [l.text, l.unitPrice, l.total, l.check])).toEqual([
      ["GALLETAS X 4 TACO", 8600, 8600, "ok"], ["Pan Tajado Brioche", 7500, 7500, "ok"],
    ]);
    expect(draft.reconciliation.difference).toBe(0);
    expect(muse.calls).toBe(0);

    // Nothing of the buyer, and no copy of the files, is kept.
    const stored = await db().receipt.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: true } });
    expect(JSON.stringify(stored)).not.toMatch(/COMPRADOR|1234567|example\.com|CALLE FALSA/);
    expect(stored.imagePath).toBeNull();
  });

  it("refuses sister chains, credit notes and invoices without a matching DIAN validation with the spec's messages", async () => {
    const surtimax = fresh("carulla.xml");
    const surtimaxFile = { name: surtimax.file.name, data: strToU8(surtimax.xml.replaceAll("CARULLA EXPRESS EDS EL RETIRO", "SURTIMAX CALDAS")) };
    expect(await intake("b", [surtimaxFile])).toMatchObject([{ status: "rejected", message: MESSAGES.store }]);
    expect(await intake("b", [fresh("exito-credit-note.xml").file])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.not_invoice }]);
    expect(await intake("b", [fresh("exito-cufe-mismatch.xml").file])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.unvalidated }]);
    expect(await intake("b", [{ name: "x.xml", data: strToU8(fixture("xxe.xml")) }])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.unvalidated }]);
    expect(await db().receipt.count({ where: { contributor: { sessionId: session("b") } } })).toBe(0);
  });

  it("accepts a Carulla invoice as Carulla: a first Carulla price earns the gap bonus, and no second account can send it", async () => {
    // A Carulla product nobody has priced yet.
    const carulla = await ensureRetailer(db(), "carulla");
    const product = await db().product.create({ data: { name: `Galletas prueba ${RUN}`, size: 4, unit: "unit" } });
    const listing = await db().retailerProduct.create({ data: { retailerId: carulla.id, productId: product.id, externalId: `test-${RUN}`, name: `Galletas x 4 taco ${RUN}`, url: "https://www.carulla.com", lastSeenAt: new Date() } });
    try {
      const invoice = fresh("carulla.xml");
      const [outcome] = await intake("cr", [invoice.file]);
      expect(outcome).toMatchObject({ status: "accepted", draft: { store: "Carulla", branch: "CARULLA EXPRESS EDS EL RETIRO" } });
      const draft = (outcome as { draft: import("./receipts").ReceiptDraft }).draft;
      const result = await confirmDraft({
        sessionId: session("cr"), receiptId: draft.id,
        edits: [{ index: 0, listingId: listing.id }, ...(draft.lines[1]!.match ? [] : [{ index: 1, noMatch: true }])],
      });
      expect(result.breakdown).toContainEqual({ label: "Primer precio en Carulla", points: 15, lines: 1 });
      expect(await db().priceObservation.findFirst({ where: { retailerProductId: listing.id }, select: { price: true, source: true } })).toEqual({ price: 8600, source: "community:receipt" });

      expect(await intake("cr2", [invoice.file])).toMatchObject([{ status: "rejected", code: "duplicate", message: MESSAGES.duplicate }]);
    } finally {
      await cleanupContributors(RUN);
      await db().priceObservation.deleteMany({ where: { retailerProductId: listing.id } });
      await db().retailerProduct.delete({ where: { id: listing.id } });
      await db().product.delete({ where: { id: product.id } });
    }
  });

  it("refuses an invoice issued four days ago", async () => {
    expect(await intake("c", [fresh("exito.xml", 96).file])).toMatchObject([{ status: "rejected", message: MESSAGES.old }]);
  });

  it("accepts a bare invoice XML as not DIAN-confirmed", async () => {
    const [outcome] = await intake("c2", [fresh("exito-invoice.xml").file]);
    expect(outcome).toMatchObject({ status: "accepted", draft: { dianConfirmed: false, source: "einvoice" } });
  });

  it("refuses an invoice already registered, by e-invoice or by a photo showing its CUFE", async () => {
    const first = fresh("exito.xml");
    const [accepted] = await intake("d", [first.file]);
    await confirmDraft({ sessionId: session("d"), receiptId: (accepted as { draft: { id: string } }).draft.id, edits: [] });
    expect(await intake("e", [asZip(first.xml)])).toMatchObject([{ status: "rejected", code: "duplicate", message: MESSAGES.duplicate }]);

    const second = fresh("exito.xml");
    const local = new Date(Date.now() - 3 * 3_600_000 - 5 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    muse.extraction = {
      store: "ALMACENES EXITO S.A.", branch: "Exito Laureles", total: "16.100", invoice_number: `POS ${RUN}-photo`, cufe: second.cufe,
      purchased_at: `${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`,
      lines: [{ kind: "item", text: "GALLETAS X 4 TACO", code: "", quantity: "1", unit_price: "8.600", total: "8.600" }],
    };
    const photo = await createDraft({ sessionId: session("f"), image: strToU8(`${RUN}-photo`), mime: "image/jpeg" });
    await confirmDraft({ sessionId: session("f"), receiptId: photo.id, edits: [] });
    expect(await intake("g", [second.file])).toMatchObject([{ status: "rejected", message: MESSAGES.duplicate }]);
    expect(await db().duplicateAttempt.findFirst({ where: { contributor: { sessionId: session("g") } }, select: { layer: true } })).toEqual({ layer: "cufe" });
  });

  it("refuses files that aren't an invoice", async () => {
    expect(await intake("h", [{ name: "factura.docx", data: zipSync({ "word/document.xml": strToU8("<w/>") }) }])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.type }]);
    expect(await intake("h", [])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.missing }]);
  });

  it("reads a PDF-only invoice through the photo extraction, marked as read from a PDF", async () => {
    const local = new Date(Date.now() - 2 * 3_600_000 - 5 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    muse.extraction = {
      store: "ALMACENES EXITO S.A.", branch: "EXITO LAURELES", total: "8.600", invoice_number: `QZ96 ${RUN}-pdf`, cufe: "",
      purchased_at: `${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`,
      lines: [{ kind: "item", text: "GALLETAS X 4 TACO", code: "964159", quantity: "1", unit_price: "8.600", total: "8.600" }],
    };
    const [outcome] = await intake("i", [{ name: "fv0890.pdf", data: PDF }]);
    expect(outcome).toMatchObject({ status: "accepted", draft: { source: "einvoice-pdf", dianConfirmed: false, store: "Éxito" } });
    expect(muse.photos).toBe(1);
    const stored = await db().receipt.findUniqueOrThrow({ where: { id: (outcome as { draft: { id: string } }).draft.id } });
    expect(stored.imagePath).toBeNull();

    muse.down = true;
    // Another file: the same PDF from someone else would be refused before reading, as held by "i".
    const other = new Uint8Array([...PDF, ...strToU8("% another\n")]);
    expect(await intake("j", [{ name: "fv0891.pdf", data: other }])).toMatchObject([{ status: "rejected", message: EINVOICE_MESSAGES.pdf }]);
  });

  it("confirms an e-invoice like a photo: prices, points, and the 'factura electrónica' label", async () => {
    const { file } = fresh("exito-weighed.xml");
    const [outcome] = await intake("k", [file]);
    const draft = (outcome as { draft: import("./receipts").ReceiptDraft }).draft;
    expect(draft.lines.map((l) => [l.kind, l.total])).toEqual([["item", 8600], ["item", 3363], ["item", 7500], ["discount", -1000]]);
    expect(draft.lines[1]!.match).toMatchObject({ by: "produce", produce: { slug: "banano", unit: "kg" } });
    // The person fixes one product match: the galletas are a listing they pick from the store.
    const pick = await db().retailerProduct.findFirstOrThrow({ where: { retailer: { slug: "exito" }, name: { contains: "Galleta", mode: "insensitive" } }, select: { id: true, name: true } });
    const result = await confirmDraft({
      sessionId: session("k"), receiptId: draft.id,
      edits: [{ index: 0, listingId: pick.id }, ...(draft.lines[2]!.match ? [] : [{ index: 2, noMatch: true }])],
    });
    const observations = await db().priceObservation.findMany({ where: { receiptLine: { receiptId: draft.id } }, select: { price: true, source: true, retailerProductId: true } });
    expect(observations.length).toBe(result.acceptedLines);
    expect(observations).toEqual(expect.arrayContaining([
      { price: 8600, source: "community:receipt", retailerProductId: pick.id },
      expect.objectContaining({ price: 3980, source: "community:receipt" }),
    ]));
    expect(result.points).toBeGreaterThanOrEqual(result.acceptedLines * 10);
    const banana = await db().receiptLine.findFirstOrThrow({ where: { receiptId: draft.id, position: 1 }, select: { priceDerived: true, accepted: true } });
    expect(banana).toEqual({ priceDerived: true, accepted: true });

    const offers = await searchSnapshot(pick.name, { stores: ["exito"], source: "receipt" });
    expect(offers.find((o) => o.id === pick.id)).toMatchObject({ source: "receipt", price: 8600, einvoice: true });
  });
});
