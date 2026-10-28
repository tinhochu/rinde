import "server-only";
import {
  checkLine, detectStore, effectiveUnitPrice, headerKey, normalizeCufe, normalizeInvoiceNumber, parseCop, parseLines,
  parseQuantity, parseReceiptDate, PRODUCE, reconcile, scrubPersonalData, type LineIssue, type ParsedLine, type Reconciliation,
} from "@rinde/core";
import { db, ensureRetailer, RETAILERS, type Prisma, type RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG, type Store } from "./contract";
import { extractReceipt, MuseUnavailable, sha256 } from "./muse";
import { matchLines, searchCandidates, sizeLabel, type LineMatch, type ListingOption } from "./receipt-match";
import { saveReceiptImage } from "./receipt-storage";
import { awardLines, isGap, syncBadges, BADGES, type BadgeId } from "./rewards";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Photos of one long receipt, top to bottom */
export const MAX_PARTS = 4;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
const MAX_AGE_MS = 72 * 3_600_000;
const FUTURE_SLACK_MS = 15 * 60_000;
const DAILY_RECEIPTS = 5;
const DUPLICATES_BEFORE_PAUSE = 3;
const PAUSE_MS = 24 * 3_600_000;

/** A refusal shown to the user verbatim (receipt-capture spec). */
export class ReceiptRejected extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

export const MESSAGES = {
  paused: "Pausamos el escaneo de facturas por 24 horas por intentos repetidos.",
  duplicate: "Esta factura ya fue registrada.",
  store: "Por ahora leemos facturas de D1, Jumbo, Éxito y Carulla.",
  top: "No vemos el nombre de la tienda. Incluye la parte de arriba de la factura; si es larga, tómala en varias fotos.",
  invoice: "No pudimos leer el número de la factura. Incluye la parte de abajo; si la factura es larga, agrégala como otra foto.",
  date: "No pudimos leer la fecha de la factura. Toma la foto de nuevo con la fecha visible; si la factura es larga, tómala en varias fotos.",
  long: "La factura tardó demasiado en leerse. Si es larga, tómala en 2 o 3 fotos, de arriba a abajo.",
  slow: "No alcanzamos a leer las fotos a tiempo. Inténtalo de nuevo.",
  old: "Esta factura tiene más de 3 días; sus precios ya no sirven para comparar.",
  future: "La fecha de la factura es posterior a hoy. Revisa la foto.",
  cap: "Llegaste al máximo de 5 facturas por hoy.",
  unavailable: "Leer facturas no está disponible por ahora.",
};

// ── Wire types (apps/mobile/lib/receipts.ts mirrors these) ──────────────────

export type DraftLine = {
  index: number;
  kind: "item" | "discount";
  text: string;
  code: string | null;
  quantity: { value: number; unit: string } | null;
  unitPrice: number | null;
  total: number | null;
  check: "ok" | LineIssue;
  match: LineMatch | null;
  options: ListingOption[];
};

export type ReceiptDraft = {
  id: string;
  store: Store;
  branch: string;
  purchasedAt: string;
  total: number | null;
  invoiceNumber: string;
  cufe: string | null;
  /** photo | einvoice | einvoice-pdf */
  source: ReceiptSource;
  /** An e-invoice whose DIAN validation matched its CUFE */
  dianConfirmed: boolean;
  /** Pesos the lines may differ from the total and still add up */
  tolerance: number;
  demo: boolean;
  lines: DraftLine[];
  reconciliation: Reconciliation;
};

export type ConfirmEdit = {
  index: number;
  excluded?: boolean;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  /** A listing the user chose; must belong to the receipt's store */
  listingId?: string;
  /** "No está en la lista" */
  noMatch?: boolean;
};

export type ConfirmResult = {
  receiptId: string;
  points: number;
  breakdown: { label: string; points: number; lines: number }[];
  acceptedLines: number;
  badges: { id: BadgeId; name: string; description: string }[];
  balance: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function contributorFor(sessionId: string, zone?: string) {
  return db().contributor.upsert({
    where: { sessionId },
    create: { sessionId, ...(zone ? { zone } : {}) },
    update: zone ? { zone } : {},
  });
}

const ACCEPTED = ["confirmed", "revoked"];

type Identity = { imageHash: string; store?: RetailerSlug; invoiceNumber?: string; cufe?: string | null; headerFingerprint?: string };

/** Unreviewed drafts are discarded after this long (apps/worker cleanup), which releases their claim. */
const DRAFT_TTL_MS = 24 * 3_600_000;

/**
 * Who is asking, when a pending draft should count: one invoice belongs to one person, so another
 * person's draft of it (still within its 24 h) holds it as firmly as a confirmed receipt does.
 */
type Claimant = { contributorId: string; now: Date };

/** Which duplicate layer (if any) an accepted receipt, or another person's pending draft, already holds. */
async function findDuplicate(tx: Prisma.TransactionClient | ReturnType<typeof db>, id: Identity, claimant?: Claimant) {
  const or: Prisma.ReceiptWhereInput[] = [{ imageHash: id.imageHash }];
  if (id.store && id.invoiceNumber) or.push({ store: id.store, invoiceNumber: id.invoiceNumber });
  if (id.cufe) or.push({ cufe: id.cufe });
  if (id.headerFingerprint) or.push({ headerFingerprint: id.headerFingerprint });
  const held: Prisma.ReceiptWhereInput[] = [{ status: { in: ACCEPTED } }];
  if (claimant) {
    held.push({ status: "draft", contributorId: { not: claimant.contributorId }, createdAt: { gt: new Date(claimant.now.getTime() - DRAFT_TTL_MS) } });
  }
  const match = await tx.receipt.findFirst({ where: { AND: [{ OR: held }, { OR: or }] }, select: { id: true, imageHash: true, store: true, invoiceNumber: true, cufe: true, headerFingerprint: true } });
  if (!match) return null;
  const layer =
    match.imageHash === id.imageHash ? "image"
      : id.invoiceNumber && match.store === id.store && match.invoiceNumber === id.invoiceNumber ? "invoice"
        : id.cufe && match.cufe === id.cufe ? "cufe"
          : "header";
  return { layer, receiptId: match.id };
}

/** Records a duplicate attempt; the third within 24 h pauses scanning for this contributor. */
async function recordDuplicate(contributorId: string, layer: string, matchedReceiptId: string, now: Date) {
  const prisma = db();
  await prisma.duplicateAttempt.create({ data: { contributorId, layer, matchedReceiptId } });
  const recent = await prisma.duplicateAttempt.count({ where: { contributorId, createdAt: { gt: new Date(now.getTime() - PAUSE_MS) } } });
  if (recent >= DUPLICATES_BEFORE_PAUSE) {
    await prisma.contributor.update({ where: { id: contributorId }, data: { suspendedUntil: new Date(now.getTime() + PAUSE_MS) } });
  }
}

/** Start of today in Colombia (UTC−5). */
function todayStart(now: Date) {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 5 * 3_600_000);
}

function draftLine(line: ParsedLine, match: LineMatch | null, options: ListingOption[]): DraftLine {
  const c = checkLine(line);
  return {
    index: line.index, kind: line.kind, text: line.text, code: line.code,
    quantity: line.quantity ? { value: line.quantity.value, unit: line.quantity.unit } : null,
    unitPrice: line.unitPrice, total: line.total, check: c.ok ? "ok" : c.issue!, match, options,
  };
}

// ── Draft ────────────────────────────────────────────────────────────────────

/** Where a draft's lines came from: a photo, an e-invoice's XML, or its PDF read like a photo. */
export type ReceiptSource = "photo" | "einvoice" | "einvoice-pdf";

/** A receipt line ready for checks; `priceDerived` when its unit price is total ÷ quantity. */
export type InputLine = ParsedLine & { priceDerived?: boolean };

/** A receipt as read, whichever way it arrived: the shared input of `draftFromInput`. */
export type ReceiptInput = {
  store: RetailerSlug;
  branch: string;
  purchasedAt: Date;
  total: number | null;
  invoiceNumber: string;
  cufe: string | null;
  lines: InputLine[];
  source: ReceiptSource;
  dianConfirmed: boolean;
  demo: boolean;
  /** sha256 of the file (photos, the XML or the PDF): the "same file" duplicate layer */
  fileHash: string;
  /** Pesos the lines may differ from the total and still add up; 1 for photos */
  tolerance?: number;
};

type Submitter = { id: string; suspendedUntil: Date | null };

function assertActive(contributor: Submitter, now: Date) {
  if (contributor.suspendedUntil && contributor.suspendedUntil > now) throw new ReceiptRejected("paused", MESSAGES.paused, 429);
}

async function assertUnderCap(contributorId: string, now: Date) {
  const today = await db().receipt.count({ where: { contributorId, status: "confirmed", confirmedAt: { gte: todayStart(now) } } });
  if (today >= DAILY_RECEIPTS) throw new ReceiptRejected("cap", MESSAGES.cap, 429);
}

/** Refuses a file an accepted receipt, or someone else's pending draft, already came from, recording the attempt. */
async function assertNewFile(contributorId: string, fileHash: string, now: Date) {
  const sameFile = await findDuplicate(db(), { imageHash: fileHash }, { contributorId, now });
  if (sameFile) {
    await recordDuplicate(contributorId, sameFile.layer, sameFile.receiptId, now);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }
}

/**
 * The shared back half of every receipt: pause, daily cap, validity window, every duplicate layer,
 * catalog matching, and the draft rows. Photos and e-invoices both end here, so their rules can't drift.
 */
export async function draftFromInput(contributor: Submitter, input: ReceiptInput, now = new Date()): Promise<ReceiptDraft> {
  const prisma = db();
  assertActive(contributor, now);
  await assertUnderCap(contributor.id, now);
  // Demo fixtures were recorded on a past day, so the freshness window doesn't apply to them.
  if (!input.demo) {
    if (input.purchasedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) throw new ReceiptRejected("future", MESSAGES.future);
    if (now.getTime() - input.purchasedAt.getTime() > MAX_AGE_MS) throw new ReceiptRejected("old", MESSAGES.old);
  }
  const { store, invoiceNumber, cufe } = input;
  const headerFingerprint = sha256(headerKey(store, input.branch, input.purchasedAt, input.total ?? 0));

  const identity = { imageHash: input.fileHash, store, invoiceNumber, cufe, headerFingerprint };
  const claimant = { contributorId: contributor.id, now };
  const duplicate = await findDuplicate(prisma, identity, claimant);
  if (duplicate) {
    await recordDuplicate(contributor.id, duplicate.layer, duplicate.receiptId, now);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }

  const lines = input.lines;
  const matches = await matchLines(store, STORE_BY_SLUG[store], lines);
  const byIndex = new Map(matches.map((m) => [m.index, m]));
  const draftLines = lines.map((l) => draftLine(l, byIndex.get(l.index)?.match ?? null, byIndex.get(l.index)?.options ?? []));
  const tolerance = input.tolerance ?? 1;

  // Matching takes seconds, so two people can send the same invoice at once: claim it under a lock on
  // the store and invoice number, checking again inside it, so only the first gets a draft.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt:${store}:${invoiceNumber}`}, 0))`;
    const raced = await findDuplicate(tx, identity, claimant);
    if (raced) return { raced, receipt: null };
    const receipt = await tx.receipt.create({
      data: {
        contributorId: contributor.id, status: "draft", store, branch: input.branch, purchasedAt: input.purchasedAt, total: input.total, invoiceNumber, cufe,
        headerFingerprint, imageHash: input.fileHash, demo: input.demo, source: input.source, dianConfirmed: input.dianConfirmed, tolerance,
        lines: {
          create: draftLines.map((l) => {
            const parsed = lines[l.index]!;
            return {
              position: l.index, kind: l.kind, text: l.text, code: l.code, quantity: parsed.quantity?.value ?? null, saleUnit: parsed.quantity?.unit ?? null,
              unitPrice: l.unitPrice, total: l.total, priceDerived: parsed.priceDerived ?? false, check: l.check,
              retailerProductId: l.match?.listingId ?? null, matchedBy: l.match?.by ?? null, produceSlug: l.match?.produce?.slug ?? null,
            };
          }),
        },
      },
    });
    return { raced: null, receipt };
  });
  if (created.raced) {
    await recordDuplicate(contributor.id, created.raced.layer, created.raced.receiptId, now);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }
  const receipt = created.receipt!;

  return {
    id: receipt.id, store: STORE_BY_SLUG[store], branch: input.branch, purchasedAt: input.purchasedAt.toISOString(), total: input.total, invoiceNumber,
    cufe, source: input.source, dianConfirmed: input.dianConfirmed, tolerance,
    demo: input.demo, lines: draftLines, reconciliation: reconcile(lines, input.total),
  };
}

/**
 * The photo front end: model transcription → personal data scrubbed → header read. An identical
 * file is turned away before the model is called. Also reads an e-invoice's PDF pages (`einvoice-pdf`),
 * whose pages are never stored.
 */
export async function draftFromPhotos(input: {
  contributor: Submitter;
  photos: { data: Uint8Array; mime: string }[];
  source?: ReceiptSource;
  /** The PDF's hash for its rendered pages; photos hash themselves */
  fileHash?: string;
  now?: Date;
}): Promise<ReceiptDraft> {
  const now = input.now ?? new Date();
  const { contributor, photos } = input;
  const source = input.source ?? "photo";
  assertActive(contributor, now);
  // One photo keeps its own hash (recorded demo receipts match on it); parts hash as an ordered set.
  const fileHash = input.fileHash ?? (photos.length === 1 ? sha256(photos[0]!.data) : sha256(photos.map((p) => sha256(p.data)).join(",")));
  await assertNewFile(contributor.id, fileHash, now);
  await assertUnderCap(contributor.id, now);

  let read;
  try {
    read = await extractReceipt(photos);
  } catch (e) {
    if (e instanceof MuseUnavailable && e.timedOut) {
      throw photos.length === 1 ? new ReceiptRejected("long", MESSAGES.long, 503) : new ReceiptRejected("slow", MESSAGES.slow, 503);
    }
    if (e instanceof MuseUnavailable) throw new ReceiptRejected("unavailable", MESSAGES.unavailable, 503);
    throw e;
  }
  const extraction = scrubPersonalData(read.extraction);

  const store = detectStore(`${extraction.store} ${extraction.branch}`);
  // Nothing printed at the top was read: the photo most likely starts below the store's name.
  if (!store && !`${extraction.store}${extraction.branch}`.trim()) throw new ReceiptRejected("top", MESSAGES.top);
  if (!store) throw new ReceiptRejected("store", MESSAGES.store);
  const invoiceNumber = normalizeInvoiceNumber(extraction.invoice_number);
  if (!invoiceNumber) throw new ReceiptRejected("invoice", MESSAGES.invoice);
  const purchasedAt = parseReceiptDate(extraction.purchased_at);
  if (!purchasedAt) throw new ReceiptRejected("date", MESSAGES.date);

  const draft = await draftFromInput(contributor, {
    store, branch: extraction.branch, purchasedAt, total: parseCop(extraction.total), invoiceNumber, cufe: normalizeCufe(extraction.cufe),
    lines: parseLines(extraction), source, dianConfirmed: false, demo: read.demo, fileHash,
  }, now);
  if (source === "photo") {
    const [imagePath] = await Promise.all(photos.map((p, part) => saveReceiptImage(draft.id, p.data, part)));
    await db().receipt.update({ where: { id: draft.id }, data: { imagePath } });
  }
  return draft;
}

/** Upload → checks → extraction → matching → draft. Every rejection happens before the photo is stored. */
export async function createDraft(input: {
  sessionId: string; zone?: string;
  /** The photo, or the top part of a long receipt */
  image: Uint8Array; mime: string;
  /** The rest of a long receipt, in order down the paper */
  more?: { data: Uint8Array; mime: string }[];
  now?: Date;
}): Promise<ReceiptDraft> {
  const contributor = await contributorFor(input.sessionId, input.zone);
  const photos = [{ data: input.image, mime: input.mime }, ...(input.more ?? [])];
  return draftFromPhotos({ contributor, photos, now: input.now });
}

/**
 * A draft as the review screen needs it, for opening it again (from the inbox or a reply link). Only its
 * owner gets it. Proposed matches come from the stored rows; alternatives are searched again (no model call).
 */
export async function draftFor(sessionId: string, receiptId: string): Promise<ReceiptDraft | null> {
  const prisma = db();
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, status: "draft", contributor: { sessionId } },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!receipt) return null;
  const listingIds = receipt.lines.map((l) => l.retailerProductId).filter((id): id is string => !!id);
  const listings = new Map((await prisma.retailerProduct.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, name: true, imageUrl: true, product: { select: { size: true, unit: true } } },
  })).map((r) => [r.id, { listingId: r.id, name: r.name, image: r.imageUrl, size: sizeLabel(r.product.size?.toString() ?? null, r.product.unit) }]));

  const parsed: ParsedLine[] = [];
  const lines: DraftLine[] = [];
  for (const l of receipt.lines) {
    const line: ParsedLine = {
      index: l.position, kind: l.kind === "discount" ? "discount" : "item", text: l.text, code: l.code,
      quantity: l.quantity !== null ? quantityOf(Number(l.quantity), l.saleUnit) : null, unitPrice: l.unitPrice, total: l.total,
    };
    parsed.push(line);
    const listing = l.retailerProductId ? listings.get(l.retailerProductId) : undefined;
    const produce = l.produceSlug ? PRODUCE.find((p) => p.slug === l.produceSlug) : undefined;
    let match: LineMatch | null = null;
    if (listing) match = { ...listing, by: (l.matchedBy ?? "search") as LineMatch["by"], produce: null };
    else if (produce) {
      const unit = l.saleUnit === "kg" || l.saleUnit === "g" ? "kg" : produce.defaultUnit;
      match = { listingId: null, name: produce.name, image: null, size: unit === "kg" ? "por kg" : "por unidad", by: "produce", produce: { slug: produce.slug, name: produce.name, unit } };
    }
    const options = line.kind === "item" && !produce ? await searchCandidates(receipt.store, l.text) : [];
    lines.push({ ...draftLine(line, match, options), check: l.check === "ok" ? "ok" : (l.check as LineIssue) });
  }
  return {
    id: receipt.id, store: STORE_BY_SLUG[receipt.store], branch: receipt.branch, purchasedAt: receipt.purchasedAt.toISOString(), total: receipt.total,
    invoiceNumber: receipt.invoiceNumber, cufe: receipt.cufe, source: receipt.source as ReceiptSource, dianConfirmed: receipt.dianConfirmed,
    tolerance: receipt.tolerance, demo: receipt.demo, lines, reconciliation: reconcile(parsed, receipt.total),
  };
}

// ── Confirm ──────────────────────────────────────────────────────────────────

/** The per-store listing that carries receipt prices for a produce item ("produce:banano:kg"). */
export async function produceListing(tx: Prisma.TransactionClient, store: RetailerSlug, slug: string, unit: "kg" | "unit") {
  const externalId = `produce:${slug}:${unit}`;
  const retailer = await ensureRetailer(tx as never, store);
  const existing = await tx.retailerProduct.findUnique({ where: { retailerId_externalId: { retailerId: retailer.id, externalId } } });
  if (existing) return existing;
  // One shared product per item and unit, so every store's price groups together in comparisons.
  const sibling = await tx.retailerProduct.findFirst({ where: { externalId }, select: { productId: true } });
  const item = PRODUCE.find((p) => p.slug === slug)!;
  const name = `${item.name} ${unit === "kg" ? "por kg" : "por unidad"}`;
  const productId = sibling?.productId ?? (await tx.product.create({
    data: { name, category: "Frutas y verduras", size: unit === "kg" ? 1000 : 1, unit: unit === "kg" ? "g" : "unit" },
  })).id;
  return tx.retailerProduct.create({
    data: { retailerId: retailer.id, productId, externalId, name, url: RETAILERS[store].baseUrl, lastSeenAt: new Date() },
  });
}

/** Rebuilds a parsed quantity from a stored amount and sale unit ("unit" prints no unit). */
function quantityOf(amount: number, saleUnit: string | null) {
  const unit = !saleUnit || saleUnit === "unit" ? "" : saleUnit;
  return parseQuantity(`${String(amount).replace(".", ",")} ${unit}`.trim());
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return err.code === "P2002" || /Receipt_accepted_|unique constraint/i.test(err.message ?? "");
};

/**
 * Applies the user's line edits (the header is read-only), re-runs every check, and in one
 * transaction: accepts the receipt, records confirmed lines as prices, learns aliases, awards points.
 * The partial unique indexes make a concurrent confirm of the same receipt fail as a duplicate.
 */
export async function confirmDraft(input: { sessionId: string; receiptId: string; edits: ConfirmEdit[]; now?: Date }): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const prisma = db();
  const contributor = await contributorFor(input.sessionId);
  if (contributor.suspendedUntil && contributor.suspendedUntil > now) throw new ReceiptRejected("paused", MESSAGES.paused, 429);
  const receipt = await prisma.receipt.findFirst({ where: { id: input.receiptId, contributorId: contributor.id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!receipt) throw new ReceiptRejected("not_found", "No encontramos esta factura. Escanéala de nuevo.", 404);
  if (receipt.status !== "draft") throw new ReceiptRejected("not_draft", "Esta factura ya fue enviada.", 409);

  const duplicate = await findDuplicate(prisma, receipt);
  if (duplicate) {
    await recordDuplicate(contributor.id, duplicate.layer, duplicate.receiptId, now);
    await prisma.receipt.delete({ where: { id: receipt.id } });
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }

  const edits = new Map(input.edits.map((e) => [e.index, e]));
  // Listings the user picked must belong to this receipt's store.
  const picked = input.edits.map((e) => e.listingId).filter((id): id is string => !!id);
  const allowed = new Set((await prisma.retailerProduct.findMany({ where: { id: { in: picked }, retailer: { slug: receipt.store } }, select: { id: true } })).map((r) => r.id));

  let result: ConfirmResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const rewards: { lineId: string; produce: boolean; gap: boolean }[] = [];
      for (const line of receipt.lines) {
        const edit = edits.get(line.position);
        const amount = edit?.quantity ?? (line.quantity !== null ? Number(line.quantity) : 1);
        const quantity = quantityOf(amount, line.saleUnit);
        const parsed: ParsedLine = {
          index: line.position, kind: line.kind === "discount" ? "discount" : "item", text: line.text, code: line.code,
          quantity, unitPrice: edit?.unitPrice ?? line.unitPrice, total: edit?.total ?? line.total,
        };
        const check = checkLine(parsed);
        const listingId = edit?.noMatch ? null : edit?.listingId && allowed.has(edit.listingId) ? edit.listingId : edit?.listingId ? null : line.retailerProductId;
        const produceSlug = edit?.noMatch || edit?.listingId ? null : line.produceSlug;
        const excluded = edit?.excluded ?? false;
        const unitPrice = effectiveUnitPrice(parsed);
        const accepted = !excluded && parsed.kind === "item" && check.ok && !!unitPrice && unitPrice.price > 0 && !!(listingId || produceSlug);
        const edited = !!edit && (edit.quantity !== undefined || edit.unitPrice !== undefined || edit.total !== undefined || !!edit.listingId || !!edit.noMatch);

        let observationListing = listingId;
        if (accepted && produceSlug && !listingId) {
          const unit = quantity && (quantity.unit === "kg" || quantity.unit === "g") ? "kg" : (PRODUCE.find((p) => p.slug === produceSlug)?.defaultUnit ?? "unit");
          observationListing = (await produceListing(tx, receipt.store, produceSlug, unit)).id;
        }

        await tx.receiptLine.update({
          where: { id: line.id },
          data: {
            quantity: quantity?.value ?? null, unitPrice: unitPrice?.price ?? parsed.unitPrice, total: parsed.total,
            // An e-invoice's per-unit price of a multi-unit line was derived on read, unless the person typed one.
            priceDerived: (unitPrice?.derived ?? false) || (line.priceDerived && edit?.unitPrice === undefined),
            check: check.ok ? "ok" : check.issue!, retailerProductId: observationListing, produceSlug,
            matchedBy: edit?.listingId ? "user" : line.matchedBy, editedByUser: edited, excluded, accepted,
          },
        });
        if (!accepted) continue;

        const gap = await isGap(tx, observationListing!, receipt.id, now);
        await tx.priceObservation.create({
          data: {
            retailerProductId: observationListing!, price: unitPrice!.price, available: true, source: "community:receipt",
            sourceUrl: `rinde://receipts/${receipt.id}#${line.position}`, observedAt: receipt.purchasedAt, receiptLineId: line.id,
          },
        });
        if (!produceSlug) {
          const text = line.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
          await tx.receiptAlias.upsert({
            where: { store_text: { store: receipt.store, text } },
            create: { store: receipt.store, text, retailerProductId: observationListing! },
            update: { retailerProductId: observationListing!, hits: { increment: 1 } },
          });
        }
        rewards.push({ lineId: line.id, produce: !!produceSlug, gap });
      }

      await tx.receipt.update({ where: { id: receipt.id }, data: { status: "confirmed", confirmedAt: now } });
      const events = await awardLines(tx, contributor.id, receipt.id, receipt.store, rewards);
      const earned = await syncBadges(tx, contributor.id);
      const balance = (await tx.rewardEvent.aggregate({ where: { contributorId: contributor.id }, _sum: { points: true } }))._sum.points ?? 0;

      const breakdown = new Map<string, { points: number; lines: number }>();
      for (const e of events) {
        const b = breakdown.get(e.label) ?? { points: 0, lines: 0 };
        breakdown.set(e.label, { points: b.points + e.points, lines: b.lines + 1 });
      }
      return {
        receiptId: receipt.id,
        points: events.reduce((s, e) => s + e.points, 0),
        breakdown: [...breakdown].map(([label, b]) => ({ label, ...b })),
        acceptedLines: rewards.length,
        badges: earned.map((id) => ({ id, ...BADGES[id] })),
        balance,
      };
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Another submission of this receipt was accepted first.
    const winner = await findDuplicate(prisma, receipt);
    await recordDuplicate(contributor.id, winner?.layer ?? "invoice", winner?.receiptId ?? receipt.id, now);
    await prisma.receipt.delete({ where: { id: receipt.id } }).catch(() => undefined);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }
  return result;
}
