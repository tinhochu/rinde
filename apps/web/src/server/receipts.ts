import "server-only";
import {
  checkLine, detectStore, effectiveUnitPrice, headerKey, normalizeCufe, normalizeInvoiceNumber, parseCop, parseLines,
  parseQuantity, parseReceiptDate, PRODUCE, reconcile, scrubPersonalData, type LineIssue, type ParsedLine, type Reconciliation,
} from "@rinde/core";
import { db, ensureRetailer, RETAILERS, type Prisma, type RetailerSlug } from "@rinde/db";
import { STORE_BY_SLUG, type Store } from "./contract";
import { extractReceipt, MuseUnavailable, sha256 } from "./muse";
import { matchLines, type LineMatch, type ListingOption } from "./receipt-match";
import { saveReceiptImage } from "./receipt-storage";
import { awardLines, isGap, syncBadges, BADGES, type BadgeId } from "./rewards";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  store: "Por ahora leemos facturas de D1, Jumbo y Éxito.",
  invoice: "No pudimos leer el número de la factura. Toma la foto incluyendo la parte de abajo.",
  date: "No pudimos leer la fecha de la factura. Toma la foto de nuevo con la fecha visible.",
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

async function contributorFor(sessionId: string, zone?: string) {
  return db().contributor.upsert({
    where: { sessionId },
    create: { sessionId, ...(zone ? { zone } : {}) },
    update: zone ? { zone } : {},
  });
}

const ACCEPTED = ["confirmed", "revoked"];

type Identity = { imageHash: string; store?: RetailerSlug; invoiceNumber?: string; cufe?: string | null; headerFingerprint?: string };

/** Which duplicate layer (if any) an accepted receipt already holds. */
async function findDuplicate(tx: Prisma.TransactionClient | ReturnType<typeof db>, id: Identity) {
  const or: Prisma.ReceiptWhereInput[] = [{ imageHash: id.imageHash }];
  if (id.store && id.invoiceNumber) or.push({ store: id.store, invoiceNumber: id.invoiceNumber });
  if (id.cufe) or.push({ cufe: id.cufe });
  if (id.headerFingerprint) or.push({ headerFingerprint: id.headerFingerprint });
  const match = await tx.receipt.findFirst({ where: { status: { in: ACCEPTED }, OR: or }, select: { id: true, imageHash: true, store: true, invoiceNumber: true, cufe: true, headerFingerprint: true } });
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

/**
 * Upload → checks → extraction → matching → draft. Every rejection happens before the photo is
 * stored; an identical photo is turned away before the model is called.
 */
export async function createDraft(input: { sessionId: string; zone?: string; image: Uint8Array; mime: string; now?: Date }): Promise<ReceiptDraft> {
  const now = input.now ?? new Date();
  const prisma = db();
  const contributor = await contributorFor(input.sessionId, input.zone);
  if (contributor.suspendedUntil && contributor.suspendedUntil > now) throw new ReceiptRejected("paused", MESSAGES.paused, 429);

  const imageHash = sha256(input.image);
  const sameFile = await findDuplicate(prisma, { imageHash });
  if (sameFile) {
    await recordDuplicate(contributor.id, sameFile.layer, sameFile.receiptId, now);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }

  const today = await prisma.receipt.count({ where: { contributorId: contributor.id, status: "confirmed", confirmedAt: { gte: todayStart(now) } } });
  if (today >= DAILY_RECEIPTS) throw new ReceiptRejected("cap", MESSAGES.cap, 429);

  let read;
  try {
    read = await extractReceipt({ data: input.image, mime: input.mime });
  } catch (e) {
    if (e instanceof MuseUnavailable) throw new ReceiptRejected("unavailable", MESSAGES.unavailable, 503);
    throw e;
  }
  const extraction = scrubPersonalData(read.extraction);

  const store = detectStore(`${extraction.store} ${extraction.branch}`);
  if (!store) throw new ReceiptRejected("store", MESSAGES.store);
  const invoiceNumber = normalizeInvoiceNumber(extraction.invoice_number);
  if (!invoiceNumber) throw new ReceiptRejected("invoice", MESSAGES.invoice);
  const purchasedAt = parseReceiptDate(extraction.purchased_at);
  if (!purchasedAt) throw new ReceiptRejected("date", MESSAGES.date);
  // Demo fixtures were recorded on a past day, so the freshness window doesn't apply to them.
  if (!read.demo) {
    if (purchasedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) throw new ReceiptRejected("future", MESSAGES.future);
    if (now.getTime() - purchasedAt.getTime() > MAX_AGE_MS) throw new ReceiptRejected("old", MESSAGES.old);
  }
  const total = parseCop(extraction.total);
  const cufe = normalizeCufe(extraction.cufe);
  const headerFingerprint = sha256(headerKey(store, extraction.branch, purchasedAt, total ?? 0));

  const duplicate = await findDuplicate(prisma, { imageHash, store, invoiceNumber, cufe, headerFingerprint });
  if (duplicate) {
    await recordDuplicate(contributor.id, duplicate.layer, duplicate.receiptId, now);
    throw new ReceiptRejected("duplicate", MESSAGES.duplicate, 409);
  }

  const lines = parseLines(extraction);
  const matches = await matchLines(store, STORE_BY_SLUG[store], lines);
  const byIndex = new Map(matches.map((m) => [m.index, m]));
  const draftLines = lines.map((l) => draftLine(l, byIndex.get(l.index)?.match ?? null, byIndex.get(l.index)?.options ?? []));

  const receipt = await prisma.receipt.create({
    data: {
      contributorId: contributor.id, status: "draft", store, branch: extraction.branch, purchasedAt, total, invoiceNumber, cufe,
      headerFingerprint, imageHash, demo: read.demo,
      lines: {
        create: draftLines.map((l) => {
          const parsed = lines[l.index]!;
          return {
            position: l.index, kind: l.kind, text: l.text, code: l.code, quantity: parsed.quantity?.value ?? null, saleUnit: parsed.quantity?.unit ?? null,
            unitPrice: l.unitPrice, total: l.total, check: l.check,
            retailerProductId: l.match?.listingId ?? null, matchedBy: l.match?.by ?? null, produceSlug: l.match?.produce?.slug ?? null,
          };
        }),
      },
    },
  });
  await prisma.receipt.update({ where: { id: receipt.id }, data: { imagePath: await saveReceiptImage(receipt.id, input.image) } });

  return {
    id: receipt.id, store: STORE_BY_SLUG[store], branch: extraction.branch, purchasedAt: purchasedAt.toISOString(), total, invoiceNumber,
    demo: read.demo, lines: draftLines, reconciliation: reconcile(lines, total),
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
            quantity: quantity?.value ?? null, unitPrice: unitPrice?.price ?? parsed.unitPrice, total: parsed.total, priceDerived: unitPrice?.derived ?? false,
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
