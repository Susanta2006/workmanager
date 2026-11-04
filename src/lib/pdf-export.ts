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

  // PrivateImage resolves Supabase signed URLs asynchronously. Do not clone the paper until
  // every configured private asset has either loaded or reported a failure.
  const privateImages = Array.from(paper.querySelectorAll<HTMLElement>("[data-private-image]"));
  await Promise.all(privateImages.map((wrapper) => new Promise<void>((resolve, reject) => {
    if (wrapper.dataset.loaded === "true") { resolve(); return; }
    if (wrapper.dataset.error === "true") { reject(new Error("A private document image could not be loaded. Check the uploaded signature/seal in Settings.")); return; }
    let timeout: number | undefined;
    const observer = new MutationObserver(() => {
      if (wrapper.dataset.loaded === "true") {
        if (timeout !== undefined) window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      } else if (wrapper.dataset.error === "true") {
        if (timeout !== undefined) window.clearTimeout(timeout);
        observer.disconnect();
        reject(new Error("A private document image could not be loaded. Check the uploaded signature/seal in Settings."));
      }
    });
    observer.observe(wrapper, { attributes: true, attributeFilter: ["data-loaded", "data-error"] });
    timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Timed out loading a private document image. Try again."));
    }, 15000);
  })));

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

  try {
  // Wait for every cloned image (including privately signed seal/signature URLs) before canvas capture.
  const images = Array.from(clone.querySelectorAll("img"));
  await Promise.all(images.map(async (img) => {
    if (!img.complete) {
      await new Promise<void>((resolve, reject) => {
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error(`A document image could not be loaded: ${img.alt || "embedded image"}`)); };
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out loading document image: ${img.alt || "embedded image"}`)); }, 15000);
        const cleanup = () => {
          if (timeout !== undefined) window.clearTimeout(timeout);
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
        };
        img.addEventListener("load", onLoad, { once: true });
        img.addEventListener("error", onError, { once: true });
      });
    }
    if (typeof img.decode === "function") {
      try { await img.decode(); } catch { throw new Error(`A document image could not be decoded: ${img.alt || "embedded image"}`); }
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(`A document image is unavailable: ${img.alt || "embedded image"}`);
    }
  }));

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
        clonedDoc.querySelectorAll<HTMLElement>(".doc-paper-pdf .legal-body").forEach((node) => {
          node.style.overflow = "visible";
          node.style.height = "auto";
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
    await (html2pdf() as unknown as Worker).set(options).from(clone).save();
  } finally {
    host.remove();
  }
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
