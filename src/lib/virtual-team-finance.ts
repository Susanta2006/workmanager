// Deterministic summary of real company records for the Business Analyst.
// Used by the browser panel and by background missions. Every figure comes from the records passed
// in; nothing is estimated. The money rules are the app's own (doc-finance.ts), so the analyst and
// the Payments, Documents and Reports pages always agree.
//
// Rules applied, matching the rest of WorkManager:
// - Payments with status "received" add to money in; "refunded" subtracts.
// - "pending" (promised) payments never move a balance; they are reported separately.
// - "adjustment" entries never move a balance and are ignored here.
// - Expenses count in full whatever their status, as Reports does. Pending expenses are reported too.
// - Outstanding invoices use documentFinancials().dueNow, the same figure the Payments dialog shows.
//   Draft and cancelled invoices are excluded.
// - Open tasks are everything not completed or cancelled (the same definition as the Dashboard).
// - Dates are calendar dates in India Standard Time, the business's timezone.

import { buildLedger, documentFinancials } from "@/lib/doc-finance";

export type FinanceInput = {
  payments: any[];
  expenses: any[];
  tasks: any[];
  documents?: any[];
  projects?: any[];
  today: string; // YYYY-MM-DD in India Standard Time
};

export type OverdueTask = {
  title: string;
  due_date: string;
  status: string;
  progress: number;
};

export type FinanceSummary = {
  as_of: string;
  received_total: number;
  refunded_total: number;
  net_received: number;
  received_last_30_days: number;
  pending_payments_total: number;
  pending_payment_count: number;
  outstanding_invoices_total: number;
  outstanding_invoice_count: number;
  expenses_total: number;
  expenses_pending_total: number;
  expenses_last_30_days: number;
  net_position: number;
  payment_count: number;
  expense_count: number;
  open_task_count: number;
  overdue_task_count: number;
  overdue_tasks: OverdueTask[];
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in India Standard Time, as YYYY-MM-DD. */
export function businessDateISO(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysBefore(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function summarizeFinance({ payments, expenses, tasks, documents = [], projects = [], today }: FinanceInput): FinanceSummary {
  const since30 = daysBefore(today, 30);
  const inLast30 = (day: unknown) => {
    const value = String(day ?? "");
    return DATE_PATTERN.test(value) && value >= since30 && value <= today;
  };

  let received = 0;
  let refunded = 0;
  let receivedLast30 = 0;
  let pendingTotal = 0;
  let pendingCount = 0;
  for (const payment of payments) {
    const amount = num(payment?.amount);
    if (payment?.status === "received") {
      received += amount;
      if (inLast30(payment.payment_date)) receivedLast30 += amount;
    } else if (payment?.status === "refunded") {
      refunded += amount;
      if (inLast30(payment.payment_date)) receivedLast30 -= amount;
    } else if (payment?.status === "pending") {
      pendingTotal += amount;
      pendingCount += 1;
    }
  }

  let expensesTotal = 0;
  let expenses30 = 0;
  let expensesPending = 0;
  for (const expense of expenses) {
    const amount = num(expense?.amount);
    expensesTotal += amount;
    if (expense?.status === "pending") expensesPending += amount;
    if (inLast30(expense?.expense_date)) expenses30 += amount;
  }

  // Outstanding invoices: the amount still to collect, using the app's own invoice rules.
  const ledger = buildLedger(payments, documents);
  const projectsById: Record<string, any> = Object.fromEntries(projects.map((project) => [project.id, project]));
  let outstanding = 0;
  let outstandingCount = 0;
  for (const doc of documents) {
    if (doc?.doc_type !== "invoice" || ["draft", "cancelled"].includes(doc.status)) continue;
    const due = documentFinancials(doc, projectsById[doc.project_id], ledger).dueNow;
    if (due > 0.009) {
      outstanding += due;
      outstandingCount += 1;
    }
  }

  const open = tasks.filter((task) => !["completed", "cancelled"].includes(task?.status));
  const overdue: OverdueTask[] = open
    .filter((task) => DATE_PATTERN.test(String(task?.due_date ?? "")) && task.due_date < today)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .map((task) => ({
      title: String(task.title ?? "Untitled task").slice(0, 160),
      due_date: task.due_date,
      status: String(task.status ?? ""),
      progress: num(task.progress),
    }));

  const netReceived = received - refunded;
  return {
    as_of: today,
    received_total: round2(received),
    refunded_total: round2(refunded),
    net_received: round2(netReceived),
    received_last_30_days: round2(receivedLast30),
    pending_payments_total: round2(pendingTotal),
    pending_payment_count: pendingCount,
    outstanding_invoices_total: round2(outstanding),
    outstanding_invoice_count: outstandingCount,
    expenses_total: round2(expensesTotal),
    expenses_pending_total: round2(expensesPending),
    expenses_last_30_days: round2(expenses30),
    net_position: round2(netReceived - expensesTotal),
    payment_count: payments.length,
    expense_count: expenses.length,
    open_task_count: open.length,
    overdue_task_count: overdue.length,
    overdue_tasks: overdue.slice(0, 10),
  };
}
