import { num, round2 } from "@/lib/format";
import { computeTotals, showsPayment } from "@/lib/doc-types";

/**
 * Single source of truth for document money.
 *
 * Rules (confirmed):
 * - A quotation is the fixed project price. It never takes payments and never changes.
 * - Payments are the ledger: "received" adds, "refunded" subtracts, "pending" and
 *   "adjustment" never move a balance.
 * - An invoice's total is the sum of its own lines (the amount billed on that invoice).
 * - For a project invoice:
 *     actual    = the project's agreed price
 *     paidBefore = what the project had been paid before the invoice was issued
 *     left      = actual − paidBefore − total           ("amount left to pay")
 *     dueNow    = total − received on this invoice       ("still to collect on this invoice")
 * - A receipt records one payment:
 *     paidBefore = paid before that payment, received = paidBefore + this amount,
 *     left = actual − received.
 * - Invoices and receipts freeze their project figures on issue (project_billing), so the
 *   document the client received never changes afterwards.
 */

export const DUE_TYPES = ["invoice"];

export function canTakePayment(doc: any) {
  return doc?.doc_type === "invoice";
}

export function isProjectBilled(doc: any, project: any) {
  return Boolean(
    doc &&
      project &&
      ["invoice", "receipt"].includes(doc.doc_type) &&
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

/** Each payment gets an effective project: its own project, or the project of the invoice it is recorded against. */
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
  kind: "invoice" | "receipt" | "other";
  total: number; // invoice: sum of its lines; receipt: amount received now; other: document total
  toBePaid: number; // invoice: sum of its lines
  actual: number; // project agreed price (or the document total when not project-billed)
  paidBefore: number;
  thisAmount: number | null;
  received: number; // invoice: received on this invoice; receipt: paid to date
  left: number; // amount left to pay on the project after this document
  dueNow: number; // invoice: still to collect on this invoice
  balance: number; // the figure shown as "balance" (left for project documents, dueNow otherwise)
  rows: any[];
};

const NO_FIGURES: Financials = {
  billed: false,
  kind: "other",
  total: 0,
  toBePaid: 0,
  actual: 0,
  paidBefore: 0,
  thisAmount: null,
  received: 0,
  left: 0,
  dueNow: 0,
  balance: 0,
  rows: [],
};

const has = (value: any) => value !== undefined && value !== null && value !== "";

/** What the project had been paid on or before a date. */
export function paidBeforeDate(ledger: Ledger, projectId: string, date: any) {
  const cutoff = String(date || "").slice(0, 10);
  return ledgerNet(
    ledger.payments.filter(
      (p) => p._project_id === projectId && String(p.payment_date || "").slice(0, 10) <= cutoff,
    ),
  );
}

/** What the project had been paid before one specific payment, in payment order. */
export function paidBeforePayment(ledger: Ledger, projectId: string, payment: any) {
  const rows = ledger.payments
    .filter((p) => p._project_id === projectId)
    .sort(byDateThenCreated);
  const index = rows.findIndex((p) => p.id === payment.id);
  return ledgerNet(index >= 0 ? rows.slice(0, index) : rows);
}

/** Frozen figures written onto an invoice when it is issued. */
export function invoiceSnapshot(ledger: Ledger, project: any, issueDate: any) {
  return {
    actual_price: round2(num(project.project_value)),
    paid_before: paidBeforeDate(ledger, project.id, issueDate),
  };
}

/** Frozen figures written onto a receipt when it is generated from a payment. */
export function receiptSnapshot(ledger: Ledger, project: any, payment: any) {
  return {
    actual_price: round2(num(project.project_value)),
    paid_before: paidBeforePayment(ledger, project.id, payment),
    this_amount: round2(num(payment.amount)),
  };
}

/** Live figures for one document, read from the ledger and any frozen snapshot. */
export function documentFinancials(doc: any, project: any, ledger: Ledger = EMPTY_LEDGER): Financials {
  if (!doc) return NO_FIGURES;
  const billed = isProjectBilled(doc, project);
  const snap = doc.project_billing || null;
  const docRows = ledger.payments
    .filter((p) => p.document_id === doc.id)
    .sort(byDateThenCreated);

  if (doc.doc_type === "invoice") {
    // A project invoice bills its lines exactly (no tax, the project price is all-in). Other invoices keep their tax.
    const toBePaid = round2(computeTotals(doc.items || [], billed ? 0 : num(doc.tax_rate)).total);
    const received = ledgerNet(docRows);
    const dueNow = round2(Math.max(0, toBePaid - received));
    if (billed) {
      const actual = round2(num(snap?.actual_price ?? project.project_value));
      const paidBefore = has(snap?.paid_before)
        ? round2(num(snap.paid_before))
        : paidBeforeDate(ledger, project.id, doc.issue_date);
      const left = round2(Math.max(0, actual - paidBefore - toBePaid));
      return {
        billed,
        kind: "invoice",
        total: toBePaid,
        toBePaid,
        actual,
        paidBefore,
        thisAmount: null,
        received,
        left,
        dueNow,
        balance: left,
        rows: docRows,
      };
    }
    return {
      billed: false,
      kind: "invoice",
      total: toBePaid,
      toBePaid,
      actual: toBePaid,
      paidBefore: 0,
      thisAmount: null,
      received,
      left: dueNow,
      dueNow,
      balance: dueNow,
      rows: docRows,
    };
  }

  if (doc.doc_type === "receipt") {
    if (billed) {
      const actual = round2(num(snap?.actual_price ?? project.project_value));
      const own = doc.payment_id ? ledger.payments.find((p) => p.id === doc.payment_id) : null;
      let paidBefore: number;
      let thisAmount: number;
      if (snap && has(snap.paid_before)) {
        paidBefore = round2(num(snap.paid_before));
        thisAmount = round2(num(snap.this_amount ?? doc.total));
      } else {
        paidBefore = own ? paidBeforePayment(ledger, project.id, own) : 0;
        thisAmount = round2(num(own ? own.amount : doc.total));
      }
      const received = round2(paidBefore + thisAmount);
      const left = round2(Math.max(0, actual - received));
      return {
        billed,
        kind: "receipt",
        total: thisAmount,
        toBePaid: actual,
        actual,
        paidBefore,
        thisAmount,
        received,
        left,
        dueNow: 0,
        balance: left,
        rows: [],
      };
    }
    const amount = round2(num(doc.total));
    return {
      billed: false,
      kind: "receipt",
      total: amount,
      toBePaid: amount,
      actual: amount,
      paidBefore: 0,
      thisAmount: amount,
      received: amount,
      left: 0,
      dueNow: 0,
      balance: 0,
      rows: docRows,
    };
  }

  // Quotations and other documents: the price is fixed and nothing is ever received against them.
  const total = round2(num(doc.total));
  return {
    billed: false,
    kind: "other",
    total,
    toBePaid: total,
    actual: total,
    paidBefore: 0,
    thisAmount: null,
    received: 0,
    left: total,
    dueNow: 0,
    balance: total,
    rows: [],
  };
}

/**
 * Status of an invoice from its numbers. Draft and cancelled keep their status until changed.
 * Overdue means the amount still to collect on this invoice is unpaid after its due date.
 */
export function invoiceStatus(doc: any, fin: { toBePaid: number; received: number; dueNow: number }) {
  if (doc.status === "cancelled") return "cancelled";
  const open = fin.dueNow > 0.009;
  if (!open && fin.toBePaid > 0) return "paid";
  if (fin.received > 0 && open) return "partially_paid";
  if (doc.status === "draft") return "draft";
  if (open && doc.due_date && new Date(doc.due_date) < new Date(new Date().toDateString())) return "overdue";
  return "sent";
}

/** Status to store. Quotations keep the status chosen by the user, because payments never affect them. */
export function resolveStatus(doc: any, fin: Financials) {
  if (doc.doc_type !== "invoice") return doc.status;
  return invoiceStatus(doc, fin);
}

/** Outstanding amount read from the cached column, falling back only when the column is missing. */
export function balanceOf(doc: any) {
  if (doc?.balance_due !== undefined && doc?.balance_due !== null) return num(doc.balance_due);
  return Math.max(0, num(doc?.total) - num(doc?.amount_paid));
}
