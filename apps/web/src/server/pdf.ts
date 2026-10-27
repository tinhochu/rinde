import "server-only";

/** Pages of an invoice PDF read through the photo extraction, at most as many as photos of a long receipt. */
export const MAX_PDF_PAGES = 4;
const DPI = 150;

/**
 * Renders the first pages of a PDF to PNG in memory. MuPDF (WASM, no native build) is loaded only
 * here, on the rare PDF-only invoice, so the server doesn't pay for it otherwise.
 */
export async function renderPdfPages(pdf: Uint8Array): Promise<{ data: Uint8Array; mime: string }[]> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    const count = Math.min(doc.countPages(), MAX_PDF_PAGES);
    if (count === 0) throw new Error("PDF without pages");
    const pages: { data: Uint8Array; mime: string }[] = [];
    for (let i = 0; i < count; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(DPI / 72, DPI / 72), mupdf.ColorSpace.DeviceRGB, false, true);
      pages.push({ data: pixmap.asPNG(), mime: "image/png" });
      pixmap.destroy();
      page.destroy();
    }
    return pages;
  } finally {
    doc.destroy();
  }
}
