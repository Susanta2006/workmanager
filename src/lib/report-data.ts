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

/** Every year that has activity, oldest first. */
export function yearSeries({ documents = [], payments = [], expenses = [] }: { documents?: any[]; payments?: any[]; expenses?: any[] } = {}) {
  const invoices = liveInvoices(documents);
  const map = new Map();

  const bucket = (value: any) => {
    const year = String(value || "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) return null;
    if (!map.has(year)) {
      map.set(year, { key: year, label: year, invoiced: 0, collected: 0, expenses: 0, profit: 0 });
    }
    return map.get(year);
  };

  invoices.forEach((doc) => {
    const row = bucket(doc.issue_date);
    if (row) row.invoiced += num(doc.total);
  });
  payments.forEach((payment) => {
    const row = bucket(payment.payment_date);
    if (!row) return;
    if (payment.status === "received") row.collected += num(payment.amount);
    else if (payment.status === "refunded") row.collected -= num(payment.amount);
  });
  expenses.forEach((expense) => {
    const row = bucket(expense.expense_date);
    if (row) row.expenses += num(expense.amount);
  });
  map.forEach((row) => {
    row.profit = row.collected - row.expenses;
  });

  return [...map.values()].sort((a: any, b: any) => a.key.localeCompare(b.key));
}

/** Open invoices with money still owed, soonest due first. */
export function openInvoices(documents: any[] = []) {
  return liveInvoices(documents)
    .filter((doc) => num(doc.balance_due) > 0 && !["draft", "cancelled", "paid"].includes(doc.status))
    .sort((a: any, b: any) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
}

/** Shared presentation state so every financial overview uses the same sign rules. */
export function profitState(value: any) {
  const amount = num(value);
  if (amount > 0) {
    return {
      kind: "profit" as const,
      label: "Net profit",
      shortLabel: "Profit",
      hint: "Cash collected exceeds expenses",
      tone: "emerald",
    };
  }
  if (amount < 0) {
    return {
      kind: "loss" as const,
      label: "Net loss",
      shortLabel: "Loss",
      hint: "Expenses exceed cash collected",
      tone: "rose",
    };
  }
  return {
    kind: "break-even" as const,
    label: "Break-even",
    shortLabel: "Break-even",
    hint: "Cash collected equals expenses",
    tone: "slate",
  };
}

export const sumBy = (rows: any[] = [], pick: any) => rows.reduce((sum, row) => sum + num(pick(row)), 0);