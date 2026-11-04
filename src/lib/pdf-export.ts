/**
 * Saves the printable document as a PDF using html2pdf.js.
 *
 * The paper is copied onto an off-screen A4 canvas before rendering. The copy is always laid out
 * at 210 mm, with no screen scaling from the phone viewer and no toolbar, so the saved file looks
 * the same on a phone and on a desktop. The browser's print header and footer (date, title, URL,
 * page number) are never part of it. Page breaks never fall inside a table row or a block marked
 * `avoid-break`, so nothing is cut in half. The library is loaded only when someone exports.
 */
export async function downloadDocumentPdf(element: HTMLElement, filename: string) {
  if (!element) throw new Error("The document is not ready yet. Try again in a moment.");
  const paper =
    (element.matches(".doc-paper") ? element : element.querySelector<HTMLElement>(".doc-paper")) ?? element;
  const { default: html2pdf } = await import("html2pdf.js");

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    background: "#ffffff",
  });

  const clone = paper.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-print-area");
  clone.classList.add("doc-paper-pdf");
  Object.assign(clone.style, {
    width: "210mm",
    maxWidth: "210mm",
    padding: "12mm 12mm 14mm 12mm",
    margin: "0",
    boxShadow: "none",
    borderRadius: "0",
    transform: "none",
  });
  host.appendChild(clone);
  document.body.appendChild(host);

  // html2pdf reads these page-break hints at runtime; its type file leaves them out, so the options are cast.
  const options: Record<string, unknown> = {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 794,
      // Let long legal clauses flow naturally across pages instead of shrinking the entire paper.
      onclone: (clonedDoc: Document) => {
        const clonedPaper = clonedDoc.querySelector<HTMLElement>(".doc-paper-pdf");
        if (clonedPaper) {
          clonedPaper.style.height = "auto";
          clonedPaper.style.minHeight = "0";
          clonedPaper.style.overflow = "visible";
          clonedPaper.style.boxSizing = "border-box";
        }
        clonedDoc.querySelectorAll<HTMLElement>(".doc-paper-pdf *").forEach((node) => {
          node.style.maxHeight = "none";
          node.style.overflow = "visible";
        });
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".avoid-break"] },
    enableLinks: true,
  };
  type Worker = {
    set(opts: Record<string, unknown>): { from(el: HTMLElement): { save(name?: string): Promise<void> } };
  };
  try {
    await (html2pdf() as unknown as Worker).set(options).from(clone).save();
  } finally {
    host.remove();
  }
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
