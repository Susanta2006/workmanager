import { fetchAll } from "@/lib/db";
import { num, monthKey, monthLabel } from "@/lib/format";
import { fetchClients } from "@/lib/clients";
import { computeTotals } from "@/lib/doc-types";

/** Reports refresh themselves every 30 seconds, so the numbers stay current. */
export const REPORT_REFETCH_MS = 30000;

export async function loadReportData() {
  const [documents, payments, expenses, clients, projects, tasks] = await Promise.all([
    fetchAll("Document", null),
    fetchAll("Payment", null),
    fetchAll("Expense", null),
    fetchClients(),
    fetchAll("Project", null),
    fetchAll("Task", null),
  ]);
  return { documents, payments, expenses, clients, projects, tasks };
}

export const reportQueryOptions = {
  queryKey: ["reports", "live"],
  queryFn: loadReportData,
  refetchInterval: REPORT_REFETCH_MS,
  staleTime: 0,
};

/** Net cash from a payment list (received minus refunded). This is cash flow, not profit. */
export function cashOf(payments: any[] = []) {
  return payments.reduce((sum, p) => {
    if (p.status === "received") return sum + num(p.amount);
    if (p.status === "refunded") return sum - num(p.amount);
    return sum;
  }, 0);
}

/**
 * Revenue recognized when an invoice is issued (accrual basis).
 * Tax collected on behalf of the government is excluded from revenue.
 * Legacy invoices without line items fall back to their stored subtotal, then total.
 */
export function invoiceRevenue(doc: any) {
  if (!doc || doc.doc_type !== "invoice" || ["draft", "cancelled"].includes(doc.status)) return 0;
  if (Array.isArray(doc.items) && doc.items.length) {
    return num(computeTotals(doc.items, 0).subtotal);
  }
  return num(doc.subtotal ?? doc.total);
}

export const liveInvoices = (documents: any[] = []) =>
  documents.filter((d) => d.doc_type === "invoice" && !["draft", "cancelled"].includes(d.status));

/**
 * Refunds reduce recognized revenue on the refund date. For an invoice-linked refund,
 * only the pre-tax revenue portion is reversed; the tax portion is not treated as revenue.
 * Unlinked refunds are deducted in full because there is no invoice tax split to apply.
 */
export function refundsOf(payments: any[] = [], documents: any[] = []) {
  const docsById = new Map((documents || []).map((doc) => [doc.id, doc]));
  return payments.reduce((sum, payment) => {
    if (payment.status !== "refunded") return sum;
    const amount = num(payment.amount);
    const linkedInvoice = docsById.get(payment.document_id);
    if (!linkedInvoice || linkedInvoice.doc_type !== "invoice") return sum + amount;
    const gross = num(linkedInvoice.total);
    const netRevenue = invoiceRevenue(linkedInvoice);
    const revenueRatio = gross > 0 ? Math.min(1, Math.max(0, netRevenue / gross)) : 1;
    return sum + amount * revenueRatio;
  }, 0);
}

/** Accrual-basis result: issued invoice revenue less refunds and recorded expenses. */
export function accountingProfitOf({ documents = [], payments = [], expenses = [] }: { documents?: any[]; payments?: any[]; expenses?: any[] } = {}) {
  const revenue = liveInvoices(documents).reduce((sum, doc) => sum + invoiceRevenue(doc), 0);
  const refunds = refundsOf(payments, documents);
  const spent = expenses.reduce((sum, expense) => sum + num(expense.amount), 0);
  return revenue - refunds - spent;
}

export const expenseStatus = (expense: any) => expense?.status || "paid";

/** Last `count` months, oldest first. Profit is recognized invoice revenue less refunds and expenses. */
export function monthSeries({ documents = [], payments = [], expenses = [] }: { documents?: any[]; payments?: any[]; expenses?: any[] } = {}, count = 12) {
  const invoices = liveInvoices(documents);
  const months: any[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = monthKey(d);
    const invoiced = invoices
      .filter((doc) => monthKey(doc.issue_date) === key)
      .reduce((sum, doc) => sum + invoiceRevenue(doc), 0);
    const collected = cashOf(payments.filter((p) => monthKey(p.payment_date) === key));
    const refunds = refundsOf(payments.filter((p) => monthKey(p.payment_date) === key), documents);
    const spent = expenses
      .filter((expense) => monthKey(expense.expense_date) === key)
      .reduce((sum, expense) => sum + num(expense.amount), 0);
    months.push({
      key,
      label: monthLabel(key),
      invoiced,
      collected,
      refunds,
      expenses: spent,
      profit: invoiced - refunds - spent,
    });
  }
  return months;
}

/** Every year that has activity, oldest first. */
export function yearSeries({ documents = [], payments = [], expenses = [] }: { documents?: any[]; payments?: any[]; expenses?: any[] } = {}) {
  const invoices = liveInvoices(documents);
  const map = new Map();

  const bucket = (value: any) => {
    const year = String(value || "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) return null;
    if (!map.has(year)) {
      map.set(year, { key: year, label: year, invoiced: 0, collected: 0, refunds: 0, expenses: 0, profit: 0 });
    }
    return map.get(year);
  };

  invoices.forEach((doc) => {
    const row = bucket(doc.issue_date);
    if (row) row.invoiced += invoiceRevenue(doc);
  });
  payments.forEach((payment) => {
    const row = bucket(payment.payment_date);
    if (!row) return;
    if (payment.status === "received") row.collected += num(payment.amount);
    else if (payment.status === "refunded") {
      row.collected -= num(payment.amount);
      row.refunds += refundsOf([payment], documents);
    }
  });
  expenses.forEach((expense) => {
    const row = bucket(expense.expense_date);
    if (row) row.expenses += num(expense.amount);
  });
  map.forEach((row) => {
    row.profit = row.invoiced - row.refunds - row.expenses;
  });

  return [...map.values()].sort((a: any, b: any) => a.key.localeCompare(b.key));
}

/** Open invoices with money still owed, soonest due first. */
export function openInvoices(documents: any[] = []) {
  return liveInvoices(documents)
    .filter((doc) => num(doc.balance_due) > 0 && !["draft", "cancelled", "paid"].includes(doc.status))
    .sort((a: any, b: any) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
}

export const sumBy = (rows: any[] = [], pick: any) => rows.reduce((sum, row) => sum + num(pick(row)), 0);