/**
 * Saves the printable document paper as a PDF using html2pdf.js.
 *
 * The file is rendered from the paper element itself, so the browser's print header
 * and footer (date, page title, URL, page numbers) are never added. The library is
 * loaded on demand so it is only downloaded when someone exports a PDF.
 */
export async function downloadDocumentPdf(element: HTMLElement, filename: string) {
  if (!element) throw new Error("The document is not ready yet. Try again in a moment.");
  const { default: html2pdf } = await import("html2pdf.js");

  // Page-break hints are read by html2pdf at runtime but missing from its type file,
  // so the options object is typed loosely and cast when passed in.
  const options: Record<string, unknown> = {
    margin: [12, 12, 14, 12],
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: element.scrollWidth || 794,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".avoid-break"] },
  };

  type Worker = {
    set(opts: Record<string, unknown>): { from(el: HTMLElement): { save(name?: string): Promise<void> } };
  };
  const worker = html2pdf() as unknown as Worker;
  await worker.set(options).from(element).save();
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
