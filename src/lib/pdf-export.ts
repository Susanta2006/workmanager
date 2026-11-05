/**
 * Exports a document paper to PDF.
 *
 * - Invoices and receipts: always ONE page at full width (210 mm), so the left and right
 *   edges match the preview. Top and bottom padding is tightened in the export copy so
 *   the content fits A4 where possible. If it is still taller than A4, the page is made
 *   exactly that tall. Nothing is scaled down, so there are no side gaps.
 * - Legal and long-form documents: flow across pages at paragraph, row and signature
 *   boundaries, with the same top and bottom margin on every page.
 */

/** A4 at 96 dpi. The paper is laid out at this width, the same as the preview. */
const PAPER_WIDTH_PX = 794;
const PAGE_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;          // top and bottom, on every page of a multi-page export
const FINANCIAL_PADDING_MM = 8;     // export-only top and bottom padding for invoices and receipts
const CAPTURE_SCALE = 3;

const pxToMm = (px: number) => (px * PAGE_WIDTH_MM) / PAPER_WIDTH_PX;

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
 * Invoices and receipts get tighter top and bottom padding in the clone only.
 */
function createPrintHost(paper: HTMLElement, financial: boolean): { host: HTMLDivElement; clone: HTMLElement } {
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
  if (financial) {
    clone.style.paddingTop = `${FINANCIAL_PADDING_MM}mm`;
    clone.style.paddingBottom = `${FINANCIAL_PADDING_MM}mm`;
  }

  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

/**
 * One page. The page is A4 when the content fits, otherwise it is exactly as tall as the
 * content. The width is always 210 mm, so the sides match the preview.
 */
async function exportOnePage(clone: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
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

  const renderHeight = (canvas.height * PAGE_WIDTH_MM) / canvas.width;
  const fitsA4 = renderHeight <= A4_HEIGHT_MM;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: fitsA4 ? "a4" : [PAGE_WIDTH_MM, renderHeight],
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, PAGE_WIDTH_MM, renderHeight, undefined, "SLOW");
  pdf.save(filename);

  canvas.width = 1;
  canvas.height = 1;
}

/** Legal and long-form documents: flows across pages with consistent margins. */
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
  const financial = paper.classList.contains("doc-paper-financial");

  // Wait for signatures and seals before cloning, so the PDF never misses them.
  await waitForPrivateImages(paper);

  const { host, clone } = createPrintHost(paper, financial);
  try {
    await waitForImages(clone);

    if (financial) {
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
