/**
 * Exports a document paper to PDF.
 *
 * - Invoices and payment receipts: rendered as ONE A4 page. The whole page is scaled
 *   uniformly to fit, so nothing is cut off and the proportions stay the same.
 * - Legal and long-form documents: flow across as many A4 pages as needed, with the same
 *   top and bottom margin on every page. Paragraphs, table rows and signature blocks are
 *   never split across a page break.
 */

/** A4 at 96 dpi. The paper is laid out at this width, the same as the preview. */
const PAPER_WIDTH_PX = 794;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const SINGLE_PAGE_MARGIN_MM = 7;
const MULTI_PAGE_MARGIN_MM = 12;
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
    if (!img.complete) {
      await new Promise<void>((resolve, reject) => {
        const label = img.alt || "embedded image";
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
      try { await img.decode(); } catch { throw new Error(`A document image could not be decoded: ${img.alt || "embedded image"}`); }
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(`A document image is unavailable: ${img.alt || "embedded image"}`);
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

/** Creates an off-screen host at the paper's exact layout width, holding a clone of the paper. */
function createPrintHost(paper: HTMLElement, singlePage: boolean): { host: HTMLDivElement; clone: HTMLElement } {
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
    margin: "0",
    boxShadow: "none",
    borderRadius: "0",
    transform: "none",
    overflow: "visible",
    background: "#ffffff",
  });

  if (!singlePage) {
    // html2pdf applies the top and bottom margin on every page. The paper's own vertical
    // padding would only appear on the first page, so it is removed here. Left and right
    // padding stays, so the text keeps its inset on every page.
    clone.style.paddingTop = "0";
    clone.style.paddingBottom = "0";
    keepParagraphsWhole(clone);
  }

  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

/** Invoices and receipts: one A4 page, scaled as a whole so nothing is cropped. */
async function exportSinglePage(clone: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Wait for web fonts so line wrapping is measured with the final fonts.
  if ("fonts" in document) await document.fonts.ready;

  const canvas = await html2canvas(clone, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: PAPER_WIDTH_PX,
    windowWidth: PAPER_WIDTH_PX,
    scrollX: 0,
    scrollY: 0,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const availableWidth = PAGE_WIDTH_MM - SINGLE_PAGE_MARGIN_MM * 2;
  const availableHeight = PAGE_HEIGHT_MM - SINGLE_PAGE_MARGIN_MM * 2;
  // Uniform scale: the smaller of the width and height fits, so proportions never change.
  const fit = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const renderWidth = canvas.width * fit;
  const renderHeight = canvas.height * fit;
  const x = (PAGE_WIDTH_MM - renderWidth) / 2;
  const y = (PAGE_HEIGHT_MM - renderHeight) / 2;

  // PNG keeps text edges sharp; JPEG softens small type.
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, renderWidth, renderHeight, undefined, "SLOW");
  pdf.save(filename);

  canvas.width = 1;
  canvas.height = 1;
}

/** Legal and long-form documents: flows across pages with consistent margins. */
async function exportMultiPage(clone: HTMLElement, filename: string) {
  const { default: html2pdf } = await import("html2pdf.js");

  const options: Record<string, unknown> = {
    // [top, left, bottom, right] in mm. Top and bottom apply to every page. Left and right
    // are 0 because the paper's own horizontal padding already insets the text.
    margin: [MULTI_PAGE_MARGIN_MM, 0, MULTI_PAGE_MARGIN_MM, 0],
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
  const singlePage = paper.classList.contains("doc-paper-financial");

  // Wait for signatures and seals before cloning, so the PDF never misses them.
  await waitForPrivateImages(paper);

  const { host, clone } = createPrintHost(paper, singlePage);
  try {
    await waitForImages(clone);

    if (singlePage) {
      await exportSinglePage(clone, filename);
    } else {
      await exportMultiPage(clone, filename);
    }
  } finally {
    host.remove();
  }
}

/** A filesystem-safe PDF name built from the document number. */
export const pdfFilename = (docNumber: string) =>
  `${String(docNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
