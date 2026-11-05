/**
 * Exports a document paper to PDF.
 *
 * The paper is always exported at its full preview width (210 mm), so the left and right
 * edges match the preview. Nothing is ever shrunk to fit:
 *   - A document that fits at full width goes on ONE A4 page (invoices and receipts).
 *   - A longer document flows onto additional A4 pages, breaking only between paragraphs,
 *     table rows and signature blocks, with the same top and bottom margin on every page.
 */

/** A4 at 96 dpi. The paper is laid out at this width, the same as the preview. */
const PAPER_WIDTH_PX = 794;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;     // top and bottom, applied to every page of a multi-page export
const CAPTURE_SCALE = 3;

/** Waits for PrivateImage wrappers (signatures, seals) to finish loading their signed URLs. */
function waitForPrivateImages(paper: HTMLElement): Promise<void> {
  const wrappers = Array.from(paper.querySelectorAll<HTMLElement>("[data-private-image]"));
  const failure = () =>
    new Error("A private document image could not be loaded. Check the uploaded signature/seal in Settings.");

  return Promise.all(wrappers.map((wrapper) => new Promise<void>((resolve, reject) => {
    if (wrapper.dataset.loaded === "true") return resolve();
    if (wrapper.dataset.error === "true") return reject(failure());

    let timeout: number | undefined;
    const observer = new MutationObserver(() => {
      if (wrapper.dataset.loaded === "true") {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      } else if (wrapper.dataset.error === "true") {
        window.clearTimeout(timeout);
        observer.disconnect();
        reject(failure());
      }
    });
    observer.observe(wrapper, { attributes: true, attributeFilter: ["data-loaded", "data-error"] });
    timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Timed out loading a private document image. Try again."));
    }, 15000);
  }))).then(() => undefined);
}

/** Waits until every image in the clone has loaded and decoded. */
async function waitForImages(root: HTMLElement): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll("img")).map(async (img) => {
    const label = img.alt || "embedded image";
    if (!img.complete) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error(`Timed out loading document image: ${label}`));
        }, 15000);
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error(`A document image could not be loaded: ${label}`)); };
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
      try { await img.decode(); } catch { throw new Error(`A document image could not be decoded: ${label}`); }
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(`A document image is unavailable: ${label}`);
    }
  }));
}

/**
 * Splits legal body text into one block per paragraph so each paragraph can move to the next
 * page as a whole. Element children (signature blocks, tables) are left untouched.
 */
function keepParagraphsWhole(paper: HTMLElement) {
  paper.querySelectorAll<HTMLElement>(".legal-body").forEach((body) => {
    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const chunks = (node.textContent ?? "")
        .split(/\n{2,}/)
        .map((chunk) => chunk.replace(/^\n+|\n+$/g, ""))
        .filter((chunk) => chunk.trim() !== "");
      if (chunks.length === 0) { node.remove(); return; }

      const fragment = document.createDocumentFragment();
      for (const chunk of chunks) {
        const block = document.createElement("div");
        block.className = "legal-para";
        block.style.whiteSpace = "pre-wrap";
        block.style.breakInside = "avoid";
        block.style.pageBreakInside = "avoid";
        block.textContent = chunk;
        fragment.appendChild(block);
      }
      node.replaceWith(fragment);
    });
  });
}

/**
 * Off-screen host at the paper's exact layout width, holding a clone of the paper.
 * The clone keeps the paper's own left and right padding so the text inset matches the preview.
 */
function createPrintHost(paper: HTMLElement): { host: HTMLDivElement; clone: HTMLElement } {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${PAPER_WIDTH_PX}px`,
    background: "#ffffff",
    pointerEvents: "none",
  });

  const clone = paper.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-print-area");
  clone.classList.add("doc-paper-pdf");
  Object.assign(clone.style, {
    width: `${PAPER_WIDTH_PX}px`,
    maxWidth: `${PAPER_WIDTH_PX}px`,
    boxSizing: "border-box",
    margin: "0",
    boxShadow: "none",
    borderRadius: "0",
    transform: "none",
    overflow: "visible",
    background: "#ffffff",
  });

  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

/** Height of the paper in millimetres when it is laid out at full page width. */
function heightInMm(clone: HTMLElement): number {
  return clone.getBoundingClientRect().height * (PAGE_WIDTH_MM / PAPER_WIDTH_PX);
}

/** Captures the paper once at full width. Used for the one-page case. */
async function captureCanvas(clone: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  if ("fonts" in document) await document.fonts.ready;
  return html2canvas(clone, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: PAPER_WIDTH_PX,
    windowWidth: PAPER_WIDTH_PX,
    scrollX: 0,
    scrollY: 0,
  });
}

/**
 * One A4 page. The paper is placed at full page width, so its left and right edges line up
 * with the page edges exactly as they do in the preview. Only the bottom is blank if the
 * paper is shorter than the page.
 */
async function exportOnePage(clone: HTMLElement, filename: string) {
  const { jsPDF } = await import("jspdf");
  const canvas = await captureCanvas(clone);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const renderHeight = (canvas.height * PAGE_WIDTH_MM) / canvas.width;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, PAGE_WIDTH_MM, renderHeight, undefined, "SLOW");
  pdf.save(filename);

  canvas.width = 1;
  canvas.height = 1;
}

/**
 * Multi-page export. Pages are split at paragraph, row and signature boundaries. Left and
 * right edges are at full page width, so there are no side gaps on any page.
 */
async function exportFlowing(clone: HTMLElement, filename: string) {
  const { default: html2pdf } = await import("html2pdf.js");

  const options: Record<string, unknown> = {
    // [top, left, bottom, right] in mm. The top and bottom margin repeat on every page.
    margin: [PAGE_MARGIN_MM, 0, PAGE_MARGIN_MM, 0],
    filename,
    image: { type: "png" },
    html2canvas: {
      scale: CAPTURE_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: PAPER_WIDTH_PX,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        clonedDoc.querySelectorAll<HTMLElement>(".doc-paper-pdf").forEach((node) => {
          node.style.height = "auto";
          node.style.minHeight = "0";
          node.style.overflow = "visible";
        });
        clonedDoc.querySelectorAll<HTMLElement>(".doc-paper-pdf .legal-body").forEach((node) => {
          node.style.overflow = "visible";
          node.style.height = "auto";
        });
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
    pagebreak: {
      mode: ["css", "legacy"],
      avoid: ["tr", ".avoid-break", ".legal-para", ".document-signature-block", ".sow-milestone-row"],
    },
    enableLinks: true,
  };

  await html2pdf().set(options).from(clone).save();
}

/**
 * Downloads the document as a PDF.
 * Pass the paper element (or the element that contains it).
 */
export async function downloadDocumentPdf(element: HTMLElement, filename: string) {
  if (!element) throw new Error("The document is not ready yet. Try again in a moment.");

  const paper =
    (element.matches(".doc-paper") ? element : element.querySelector<HTMLElement>(".doc-paper")) ?? element;

  // Wait for signatures and seals before cloning, so the PDF never misses them.
  await waitForPrivateImages(paper);

  const { host, clone } = createPrintHost(paper);
  try {
    await waitForImages(clone);

    // The paper's own top and bottom padding applies to the first page only in a flowing
    // export, so the multi-page path removes it and uses the page margin on every page instead.
    const fitsOnOnePage = heightInMm(clone) <= PAGE_HEIGHT_MM - 2;

    if (fitsOnOnePage) {
      await exportOnePage(clone, filename);
    } else {
      clone.style.paddingTop = "0";
      clone.style.paddingBottom = "0";
      keepParagraphsWhole(clone);
      await exportFlowing(clone, filename);
    }
  } finally {
    host.remove();
  }
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
