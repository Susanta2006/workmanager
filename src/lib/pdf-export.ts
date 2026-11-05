/**
 * Exports document paper to PDF.
 * Invoices and payment receipts are rendered as one proportionally scaled A4 page;
 * legal/long-form documents retain normal multi-page pagination.
 */
export async function downloadDocumentPdf(element: HTMLElement, filename: string) {
  if (!element) throw new Error("The document is not ready yet. Try again in a moment.");
  const paper =
    (element.matches(".doc-paper") ? element : element.querySelector<HTMLElement>(".doc-paper")) ?? element;
  const isSinglePageFinancial = paper.classList.contains("doc-paper-financial");

  // PrivateImage resolves signed URLs asynchronously. Wait before cloning so the export
  // cannot capture a missing signature or seal.
  const privateImages = Array.from(paper.querySelectorAll<HTMLElement>("[data-private-image]"));
  await Promise.all(privateImages.map((wrapper) => new Promise<void>((resolve, reject) => {
    if (wrapper.dataset.loaded === "true") { resolve(); return; }
    if (wrapper.dataset.error === "true") {
      reject(new Error("A private document image could not be loaded. Check the uploaded signature/seal in Settings."));
      return;
    }
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

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: "210mm",
    background: "#ffffff",
    zIndex: "-1",
    pointerEvents: "none",
  });

  const clone = paper.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-print-area");
  clone.classList.add("doc-paper-pdf");
  Object.assign(clone.style, {
    width: "210mm",
    maxWidth: "210mm",
    boxSizing: "border-box",
    margin: "0",
    boxShadow: "none",
    borderRadius: "0",
    transform: "none",
    overflow: "visible",
    background: "#ffffff",
  });
  if (isSinglePageFinancial) clone.classList.add("doc-paper-pdf--single-page");
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const images = Array.from(clone.querySelectorAll("img"));
    await Promise.all(images.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out loading document image: ${img.alt || "embedded image"}`)); }, 15000);
          const onLoad = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error(`A document image could not be loaded: ${img.alt || "embedded image"}`)); };
          const cleanup = () => {
            window.clearTimeout(timeout);
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

    if (isSinglePageFinancial) {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      // Wait for web fonts before measuring; this avoids late font swaps changing line wraps.
      if ("fonts" in document) await document.fonts.ready;
      const contentWidth = Math.max(clone.scrollWidth, clone.clientWidth);
      const contentHeight = Math.max(clone.scrollHeight, clone.clientHeight);
      // Bound the bitmap size for unusually long descriptions/terms while keeping normal
      // invoices and receipts crisp at 2.5x capture resolution.
      const captureScale = Math.min(2.5, 16000 / Math.max(contentWidth, contentHeight));
      const canvas = await html2canvas(clone, {
        scale: captureScale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: Math.ceil(clone.getBoundingClientRect().width),
        scrollX: 0,
        scrollY: 0,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 7;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const fit = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      const renderWidth = canvas.width * fit;
      const renderHeight = canvas.height * fit;
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", x, y, renderWidth, renderHeight, undefined, "FAST");
      pdf.save(filename);
      canvas.width = 1;
      canvas.height = 1;
    } else {
      const { default: html2pdf } = await import("html2pdf.js");
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
    }
  } finally {
    host.remove();
  }
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
