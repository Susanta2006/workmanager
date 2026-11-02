import { num, round2 } from "@/lib/format";
import { computeTotals, showsPayment } from "@/lib/doc-types";

/**
 * Single source of truth for every amount on a document.
 *
 * Payments are the ledger: "received" adds, "refunded" subtracts, and "pending" or
 * "adjustment" entries never move a balance.
 *
 * Project-billed invoice (invoice linked to a project with an agreed value, and the
 * payment section switched on):
 *   total      = the project's actual price
 *   toBePaid   = the sum of the amount lines on this invoice ("to be paid now")
 *   balance    = total − toBePaid                            ("left to pay")
 *   dueNow     = toBePaid − payments received on this invoice ("still to collect here")
 *
 * Project receipt: total is the project price, balance is what is left after the
 * payments received for that project up to the receipt's own payment.
 *
 * Every other document: total is the document total, balance is total − received.
 *
 * Cached columns on the Document row are a copy of these results, refreshed by
 * syncPaymentBalances in db.ts. Screens read the live result from here.
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
 * its own project_id, or the project of the document it is recorded against.
 */
export function buildLedger(payments: any[] = [], documents: any[] = []) {
  const docsById: Record<string, any> = Object.fromEntries(
    (documents || []).map((doc: any) => [doc.id, doc]),
  );
  const rows = (payments || []).map((payment: any) => ({
    ...payment,
    _project_id: payment.project_id || docsById[payment.document_id]?.project_id || "",
  }));
  return { payments: rows, docsById };
}

export type Ledger = ReturnType<typeof buildLedger>;

export const EMPTY_LEDGER: Ledger = { payments: [], docsById: {} };

export type Financials = {
  billed: boolean;
  total: number;
  toBePaid: number;
  thisAmount: number | null;
  received: number;
  balance: number;
  dueNow: number;
  rows: any[];
};

const NO_FIGURES: Financials = {
  billed: false,
  total: 0,
  toBePaid: 0,
  thisAmount: null,
  received: 0,
  balance: 0,
  dueNow: 0,
  rows: [],
};

/** Live figures for one document. Used by the printed paper, the editor, lists and payment checks. */
export function documentFinancials(doc: any, project: any, ledger: Ledger = EMPTY_LEDGER): Financials {
  if (!doc) return NO_FIGURES;
  const billed = isProjectBilled(doc, project);

  if (billed && doc.doc_type === "receipt") {
    const total = round2(num(project.project_value));
    const projectRows = ledger.payments
      .filter((p) => p._project_id === project.id)
      .sort(byDateThenCreated);
    // A receipt records one payment. Its figures are the position after that payment.
    const own = doc.payment_id ? projectRows.find((p) => p.id === doc.payment_id) : null;
    const index = own ? projectRows.indexOf(own) : projectRows.length - 1;
    const upTo = index >= 0 ? projectRows.slice(0, index + 1) : projectRows;
    const received = ledgerNet(upTo);
    const balance = round2(Math.max(0, total - received));
    return {
      billed,
      total,
      toBePaid: total,
      thisAmount: own ? round2(num(own.amount)) : round2(num(doc.total)),
      received,
      balance,
      dueNow: balance,
      rows: projectRows,
    };
  }

  const docRows = ledger.payments
    .filter((p) => p.document_id === doc.id)
    .sort(byDateThenCreated);
  const received = ledgerNet(docRows);

  if (billed) {
    const total = round2(num(project.project_value));
    const toBePaid = round2(computeTotals(doc.items || [], 0).subtotal);
    return {
      billed,
      total,
      toBePaid,
      thisAmount: null,
      received,
      balance: round2(Math.max(0, total - toBePaid)),
      dueNow: round2(Math.max(0, toBePaid - received)),
      rows: docRows,
    };
  }

  const total = round2(num(doc.total));
  const balance = round2(Math.max(0, total - received));
  return {
    billed: false,
    total,
    toBePaid: total,
    thisAmount: null,
    received,
    balance,
    dueNow: balance,
    rows: docRows,
  };
}

/** Status implied by the numbers. Cancelled and draft documents keep their status until changed. */
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
 * a payment is recorded, the invoice is project-billed, or it was already marked part-paid.
 * Otherwise the status chosen by the user stands.
 * For a project invoice the status follows the amount to be paid now, not the full price.
 */
export function resolveStatus(doc: any, fin: Financials) {
  const derived = fin.billed || fin.rows.length > 0 || doc.status === "partially_paid";
  if (!derived) return doc.status;
  if (fin.billed && doc.doc_type === "invoice") {
    return statusFor(doc, { total: fin.toBePaid, received: fin.received, balance: fin.dueNow });
  }
  return statusFor(doc, fin);
}

/** Outstanding amount read from the cached column, falling back only when the column is missing. */
export function balanceOf(doc: any) {
  if (doc?.balance_due !== undefined && doc?.balance_due !== null) return num(doc.balance_due);
  return Math.max(0, num(doc?.total) - num(doc?.amount_paid));
}
