import { Unzip, UnzipInflate } from "fflate";
import { EInvoiceError } from "./errors";

/** One invoice file taken from an attachment: the DIAN XML or its PDF. */
export interface InvoiceFile {
  kind: "xml" | "pdf";
  /** Base name, for telling `ad…xml` from `fv…pdf` only; never used as a path */
  name: string;
  data: Uint8Array;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 20;
export const MAX_INFLATED_BYTES = 20 * 1024 * 1024;
/** Compressed bytes fed to the inflater at a time, so a lying entry is caught within ~16 MB of output */
const CHUNK = 16 * 1024;

const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const baseName = (name: string) => name.split(/[\\/]/).pop()!.slice(0, 120);

function sniff(data: Uint8Array): "zip" | "pdf" | "xml" | null {
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) return "zip";
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return "pdf";
  // UTF-8 BOM or whitespace before the first tag
  let i = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0;
  while (i < data.length && i < 64 && (data[i] === 0x20 || data[i] === 0x0a || data[i] === 0x0d || data[i] === 0x09)) i++;
  return data[i] === 0x3c ? "xml" : null;
}

/**
 * The invoice files in an attachment: a `.zip` opened in memory, or a bare `.xml`/`.pdf`.
 * Zip limits (einvoice-intake spec): 10 MB compressed, at most 20 entries, 20 MB inflated in total
 * (counted while inflating, since declared sizes can lie). Only `.xml` and `.pdf` entries are read;
 * nested archives and anything else are skipped unopened.
 */
export function openInvoiceFiles(bytes: Uint8Array, name: string): InvoiceFile[] {
  const ext = extension(name);
  if (ext && !["zip", "xml", "pdf"].includes(ext)) throw new EInvoiceError("type", `.${ext} is not an invoice file`);
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new EInvoiceError("unreadable", "attachment over 10 MB");
  const kind = sniff(bytes);
  if (kind === "xml" || kind === "pdf") return [{ kind, name: baseName(name), data: bytes }];
  if (kind !== "zip") throw new EInvoiceError("unreadable", "not a zip, xml or pdf");
  return unzip(bytes);
}

function unzip(bytes: Uint8Array): InvoiceFile[] {
  const files: InvoiceFile[] = [];
  let entries = 0;
  let inflated = 0;
  let failure: string | null = null;

  const unzipper = new Unzip((entry) => {
    if (failure) return;
    if (++entries > MAX_ZIP_ENTRIES) { failure = "too many entries"; return; }
    if (entry.name.endsWith("/")) return;
    const ext = extension(entry.name);
    if (ext !== "xml" && ext !== "pdf") return;
    if ((entry.originalSize ?? 0) + inflated > MAX_INFLATED_BYTES) { failure = "declared size over budget"; return; }
    const chunks: Uint8Array[] = [];
    entry.ondata = (err, data, final) => {
      if (failure) return;
      if (err) { failure = "corrupt entry"; return; }
      inflated += data.length;
      if (inflated > MAX_INFLATED_BYTES) { failure = "inflated size over budget"; entry.terminate(); return; }
      chunks.push(data);
      if (final) files.push({ kind: ext, name: baseName(entry.name), data: concat(chunks) });
    };
    entry.start();
  });
  unzipper.register(UnzipInflate);

  try {
    for (let i = 0; i < bytes.length && !failure; i += CHUNK) unzipper.push(bytes.subarray(i, i + CHUNK), i + CHUNK >= bytes.length);
  } catch {
    failure = "corrupt zip";
  }
  if (failure) throw new EInvoiceError("unreadable", failure);
  if (files.length === 0) throw new EInvoiceError("unreadable", "no xml or pdf inside");
  return files;
}

function concat(chunks: Uint8Array[]) {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
