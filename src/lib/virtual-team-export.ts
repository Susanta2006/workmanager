// Turns a Virtual Team deliverable (Markdown text) into Word, PDF, CSV or Markdown files.
// Everything runs in the browser. Nothing is stored or sent to a third party.

import { downloadDocumentPdf } from "@/lib/pdf-export";

export const EXPORT_LABELS = { docx: "Word", pdf: "PDF", csv: "CSV", md: "Markdown" } as const;
export type ExportFormat = keyof typeof EXPORT_LABELS;

type TableBlock = { kind: "table"; header: string[]; rows: string[][] };
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "item"; number?: number; text: string }
  | TableBlock;

function plain(text: string) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function splitRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => plain(cell.trim()));
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: plain(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) { flush(); continue; }
    if (/^(\*\*\*|---|___)$/.test(line)) { flush(); continue; }

    // A table is a header row, a separator row (|---|---|), then data rows.
    if (line.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flush(); blocks.push({ kind: "heading", level: heading[1].length, text: plain(heading[2]) }); continue; }

    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) { flush(); blocks.push({ kind: "item", number: Number(ordered[1]), text: plain(ordered[2]) }); continue; }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) { flush(); blocks.push({ kind: "item", text: plain(bullet[1]) }); continue; }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function toCsv(markdown: string): string {
  const table = parseMarkdown(markdown).find((block): block is TableBlock => block.kind === "table");
  if (!table) throw new Error("This deliverable has no table. Ask the team for a table to export it as CSV.");
  // The byte-order mark makes Excel read non-English text correctly.
  return "\uFEFF" + [table.header, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const safeName = (title: string) => title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "deliverable";

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toHtml(title: string, blocks: Block[]) {
  const body = blocks
    .map((block) => {
      if (block.kind === "heading") {
        const level = Math.min(block.level + 1, 4);
        return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
      }
      if (block.kind === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
      if (block.kind === "item") return `<p class="item">${block.number ? `${block.number}.` : "•"} ${escapeHtml(block.text)}</p>`;
      const head = block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
      const rows = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  return `<h1>${escapeHtml(title)}</h1>${body}`;
}

async function pdfFile(title: string, markdown: string) {
  const paper = document.createElement("div");
  paper.className = "doc-paper";
  paper.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;padding:48px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;";
  paper.innerHTML =
    "<style>h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:18px 0 8px}h3,h4{font-size:13px;margin:14px 0 6px}" +
    "p{margin:0 0 8px}p.item{margin:0 0 5px 8px}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}" +
    "th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#eff6ff}</style>" +
    toHtml(title, parseMarkdown(markdown));
  document.body.appendChild(paper);
  try {
    await downloadDocumentPdf(paper, `${safeName(title)}.pdf`);
  } finally {
    paper.remove();
  }
}

async function docxFile(title: string, markdown: string) {
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } = await import("docx");
  const headings = [
    HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
  ];
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];
  for (const block of parseMarkdown(markdown)) {
    if (block.kind === "heading") {
      children.push(new Paragraph({ text: block.text, heading: headings[Math.min(block.level, 6) - 1] }));
    } else if (block.kind === "paragraph") {
      children.push(new Paragraph({ children: [new TextRun(block.text)], spacing: { after: 120 } }));
    } else if (block.kind === "item") {
      children.push(
        new Paragraph({
          children: [new TextRun(block.number ? `${block.number}. ${block.text}` : `• ${block.text}`)],
          indent: { left: 360 },
          spacing: { after: 80 },
        }),
      );
    } else {
      const allRows = [block.header, ...block.rows];
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: allRows.map(
            (row, index) =>
              new TableRow({
                tableHeader: index === 0,
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: cell, bold: index === 0 })] })],
                    }),
                ),
              }),
          ),
        }),
      );
    }
  }
  const document = new Document({ sections: [{ children }] });
  saveBlob(`${safeName(title)}.docx`, await Packer.toBlob(document));
}

/** Downloads one deliverable in the chosen format. Throws a readable message when the format does not fit the content. */
export async function exportDeliverable(item: { title: string; content: string }, format: ExportFormat) {
  if (format === "md") {
    saveBlob(`${safeName(item.title)}.md`, new Blob([item.content], { type: "text/markdown;charset=utf-8" }));
    return;
  }
  if (format === "csv") {
    saveBlob(`${safeName(item.title)}.csv`, new Blob([toCsv(item.content)], { type: "text/csv;charset=utf-8" }));
    return;
  }
  if (format === "docx") {
    await docxFile(item.title, item.content);
    return;
  }
  await pdfFile(item.title, item.content);
}
