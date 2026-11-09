import { fetchAll } from "@/lib/db";
import { num, monthKey, monthLabel } from "@/lib/format";
import { fetchClients } from "@/lib/clients";

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

/** Shared state for every profit/loss summary and indicator. */
export function profitState(value: number) {
  if (value > 0) return { label: "Profit", tone: "emerald", icon: "up" } as const;
  if (value < 0) return { label: "Loss", tone: "rose", icon: "down" } as const;
  return { label: "Break-even", tone: "slate", icon: "flat" } as const;
}

/** Net cash from a payment list (received minus refunded). */
export function cashOf(payments: any[] = []) {
  return payments.reduce((sum, p) => {
    if (p.status === "received") return sum + num(p.amount);
    if (p.status === "refunded") return sum - num(p.amount);
    return sum;
  }, 0);
}

export const liveInvoices = (documents: any[] = []) =>
  documents.filter((d) => d.doc_type === "invoice" && d.status !== "cancelled");

export const expenseStatus = (expense: any) => expense?.status || "paid";

/** Last `count` months, oldest first, with invoiced / collected / expenses / profit. */
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
      .reduce((sum, doc) => sum + num(doc.total), 0);
    const collected = cashOf(payments.filter((p) => monthKey(p.payment_date) === key));
    const spent = expenses
      .filter((expense) => monthKey(expense.expense_date) === key)
      .reduce((sum, expense) => sum + num(expense.amount), 0);
    months.push({
      key,
      label: monthLabel(key),
      invoiced,
      collected,
      expenses: spent,
      profit: collected - spent,
    });
  }
  return months;
}

/** Every year that has activity, oldest first. Annual profit is the sum of that year's monthly cash profit/loss values. */
export function yearSeries({ documents = [], payments = [], expenses = [] }: { documents?: any[]; payments?: any[]; expenses?: any[] } = {}) {
  const invoices = liveInvoices(documents);
  const years = new Map();
  const monthly = new Map();

  const yearBucket = (value: any) => {
    const year = String(value || "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) return null;
    if (!years.has(year)) {
      years.set(year, { key: year, label: year, invoiced: 0, collected: 0, expenses: 0, profit: 0 });
    }
    return years.get(year);
  };

  const monthBucket = (value: any) => {
    const key = monthKey(value);
    if (!/^\d{4}-\d{2}$/.test(key)) return null;
    if (!monthly.has(key)) monthly.set(key, { collected: 0, expenses: 0 });
    return monthly.get(key);
  };

  invoices.forEach((doc) => {
    const row = yearBucket(doc.issue_date);
    if (row) row.invoiced += num(doc.total);
  });
  payments.forEach((payment) => {
    const row = yearBucket(payment.payment_date);
    const month = monthBucket(payment.payment_date);
    if (!row || !month) return;
    if (payment.status === "received") {
      row.collected += num(payment.amount);
      month.collected += num(payment.amount);
    } else if (payment.status === "refunded") {
      row.collected -= num(payment.amount);
      month.collected -= num(payment.amount);
    }
  });
  expenses.forEach((expense) => {
    const row = yearBucket(expense.expense_date);
    const month = monthBucket(expense.expense_date);
    if (!row || !month) return;
    row.expenses += num(expense.amount);
    month.expenses += num(expense.amount);
  });

  // Annual net result = the sum of each month's collected-minus-expenses result.
  monthly.forEach((month, key) => {
    const row = years.get(key.slice(0, 4));
    if (row) row.profit += month.collected - month.expenses;
  });

  return [...years.values()].sort((a: any, b: any) => a.key.localeCompare(b.key));
}

/** Open invoices with money still owed, soonest due first. */
export function openInvoices(documents: any[] = []) {
  return liveInvoices(documents)
    .filter((doc) => num(doc.balance_due) > 0 && !["draft", "cancelled", "paid"].includes(doc.status))
    .sort((a: any, b: any) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
}

export const sumBy = (rows: any[] = [], pick: any) => rows.reduce((sum, row) => sum + num(pick(row)), 0);