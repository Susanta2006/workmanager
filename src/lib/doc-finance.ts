import { num, round2 } from "@/lib/format";
import { showsPayment } from "@/lib/doc-types";

/**
 * Single source of truth for every amount on a document.
 *
 * Rules:
 * - Payments are the ledger. "received" adds, "refunded" subtracts. "pending" and
 *   "adjustment" entries never move a balance.
 * - An invoice or receipt linked to a project with an agreed value (project_value > 0)
 *   is "project billed": its total is that agreed value, and what has been received is
 *   every ledger entry for the project, whichever document it was recorded against.
 * - Every other document uses its own total and the payments recorded against it.
 *
 * Cached columns on the Document row (total, amount_paid, balance_due, status) are only
 * a copy of these results. They are refreshed by syncPaymentBalances in db.ts, and every
 * screen reads the live result from here.
 */

const PROJECT_BILLED_TYPES = ["invoice", "receipt"];

export function isProjectBilled(doc: any, project: any) {
  return Boolean(
    doc &&
      project &&
      PROJECT_BILLED_TYPES.includes(doc.doc_type) &&
      showsPayment(doc) &&
      num(project.project_value) > 0,
  );
}

/** Net money in a list of ledger entries. */
export function ledgerNet(payments: any[] = []) {
  return round2(
    payments.reduce((sum, payment) => {
      if (payment.status === "received") return sum + num(payment.amount);
      if (payment.status === "refunded") return sum - num(payment.amount);
      return sum;
    }, 0),
  );
}

const byDateThenCreated = (a: any, b: any) =>
  String(a.payment_date || "").localeCompare(String(b.payment_date || "")) ||
  String(a.created_date || "").localeCompare(String(b.created_date || ""));

/**
 * Builds the lookup used by documentFinancials. Each payment gets an effective project:
 * its own project_id, or the project of the document it is recorded against (for entries
 * saved before project_id was stored).
 */
export function buildLedger(payments: any[] = [], documents: any[] = []) {
  const docsById: Record<string, any> = Object.fromEntries(
    (documents || []).map((doc: any) => [doc.id, doc]),
  );
  const rows = (payments || []).map((payment: any) => ({
    ...payment,
    _project_id:
      payment.project_id || docsById[payment.document_id]?.project_id || "",
  }));
  return { payments: rows, docsById };
}

export type Ledger = ReturnType<typeof buildLedger>;

export const EMPTY_LEDGER: Ledger = { payments: [], docsById: {} };

/** Live figures for one document. Used by the printed paper, the editor, lists and payment checks. */
export type Financials = {
  billed: boolean;
  total: number;
  thisAmount: number | null;
  received: number;
  balance: number;
  rows: any[];
};

const NO_FIGURES: Financials = { billed: false, total: 0, thisAmount: null, received: 0, balance: 0, rows: [] };

export function documentFinancials(doc: any, project: any, ledger: Ledger = EMPTY_LEDGER): Financials {
  if (!doc) return NO_FIGURES;
  const billed = isProjectBilled(doc, project);

  if (billed) {
    const total = round2(num(project.project_value));
    const projectRows = ledger.payments
      .filter((p) => p._project_id === project.id)
      .sort(byDateThenCreated);

    if (doc.doc_type === "receipt") {
      // A receipt records one payment. Its figures are the balance after that payment.
      const own = doc.payment_id
        ? projectRows.find((p) => p.id === doc.payment_id)
        : null;
      const index = own ? projectRows.indexOf(own) : projectRows.length - 1;
      const upTo = index >= 0 ? projectRows.slice(0, index + 1) : projectRows;
      const received = ledgerNet(upTo);
      return {
        billed,
        total,
        thisAmount: own ? round2(num(own.amount)) : round2(num(doc.total)),
        received,
        balance: round2(Math.max(0, total - received)),
        rows: projectRows,
      };
    }

    const received = ledgerNet(projectRows);
    return {
      billed,
      total,
      thisAmount: null,
      received,
      balance: round2(Math.max(0, total - received)),
      rows: projectRows,
    };
  }

  const docRows = ledger.payments
    .filter((p) => p.document_id === doc.id)
    .sort(byDateThenCreated);
  const total = round2(num(doc.total));
  const received = ledgerNet(docRows);
  return {
    billed,
    total,
    thisAmount: null,
    received,
    balance: round2(Math.max(0, total - received)),
    rows: docRows,
  };
}

/**
 * Status implied by the numbers, following the same rules the rest of the app uses.
 * Cancelled and draft documents keep their status until someone changes it.
 */
export function statusFor(doc: any, fin: { total: number; received: number; balance: number }) {
  if (doc.status === "cancelled") return "cancelled";
  if (fin.total > 0 && fin.balance <= 0.009) return "paid";
  if (fin.received > 0) return "partially_paid";
  if (doc.status === "draft") return "draft";
  if (doc.due_date && new Date(doc.due_date) < new Date(new Date().toDateString())) return "overdue";
  return doc.status === "accepted" ? "accepted" : "sent";
}

/**
 * The status to store. The ledger decides it only when there is something to decide from:
 * a payment is recorded, the document is project-billed, or it was already marked part-paid.
 * Otherwise the status chosen by the user stands, so a manual "Paid" without a ledger entry is not reset.
 */
export function resolveStatus(doc: any, fin: { billed: boolean; rows: any[]; total: number; received: number; balance: number }) {
  const derived = fin.billed || fin.rows.length > 0 || doc.status === "partially_paid";
  return derived ? statusFor(doc, fin) : doc.status;
}

/** Outstanding amount read from the cached column, falling back only when the column is missing. */
export function balanceOf(doc: any) {
  if (doc?.balance_due !== undefined && doc?.balance_due !== null) return num(doc.balance_due);
  return Math.max(0, num(doc?.total) - num(doc?.amount_paid));
}
