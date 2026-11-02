import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  IndianRupee,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useOrgSettings } from "@/lib/org-settings";
import DashboardHome from "@/components/dashboard/DashboardHome";
import { usePermissions } from "@/lib/permissions";
import {
  cashOf,
  liveInvoices,
  monthSeries,
  openInvoices,
  reportQueryOptions,
  sumBy,
} from "@/lib/report-data";
import { daysUntil, fmtDate, inr, monthKey, num } from "@/lib/format";
import { Briefcase } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatCard from "@/components/common/StatCard";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import {
  CollectionsChart,
  DistributionChart,
  ExpenseCategoryChart,
} from "@/components/common/LazyCharts";
import { MonthlyProfitChart } from "@/components/common/LazyCharts";
import {
  EXPENSE_CATEGORY_LABELS,
  PROJECT_STATUS,
  TASK_STATUS,
} from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · WorkManager" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { settings } = useOrgSettings();
  const { can, user } = usePermissions();
  const { data, isLoading } = useQuery(reportQueryOptions);

  const metrics = useMemo(() => {
    const documents = data?.documents || [];
    const payments = data?.payments || [];
    const expenses = data?.expenses || [];
    const clients = data?.clients || [];
    const projects = data?.projects || [];
    const tasks = data?.tasks || [];

    const months = monthSeries({ documents, payments, expenses }, 12);
    const invoices = liveInvoices(documents);
    const currentKey = monthKey(new Date());
    const thisMonth = months.find((month) => month.key === currentKey) || {
      invoiced: 0,
      collected: 0,
      expenses: 0,
      profit: 0,
    };

    const outstanding = sumBy(
      openInvoices(documents),
      (doc: any) => doc.balance_due,
    );
    const overdueInvoices = openInvoices(documents).filter(
      (doc) => (daysUntil(doc.due_date) ?? 0) < 0,
    );
    const openTasks = tasks.filter(
      (task: any) => !["completed", "cancelled"].includes(task.status),
    );
    const overdueTasks = openTasks.filter((task: any) => {
      const days = daysUntil(task.due_date);
      return days !== null && days < 0;
    });

    const expenseByCategory: Record<string, any> = {};
    expenses
      .filter((expense: any) =>
        months.some((month) => month.key === monthKey(expense.expense_date)),
      )
      .forEach((expense: any) => {
        (expenseByCategory as Record<string, any>)[expense.category] =
          ((expenseByCategory as Record<string, any>)[expense.category] || 0) + num(expense.amount);
      });

    return {
      months,
      thisMonth,
      projectValue: projects
        .filter((project: any) => project.status !== "cancelled")
        .reduce((sum: number, project: any) => sum + num(project.project_value), 0),
      invoiced: sumBy(invoices, (doc: any) => doc.total),
      collected: cashOf(payments),
      expenses: sumBy(expenses, (expense: any) => expense.amount),
      outstanding,
      overdueInvoices,
      clients: clients.length,
      activeClients: clients.filter(
        (client: any) => (client.status || "active") === "active",
      ).length,
      projects: projects.length,
      activeProjects: projects.filter(
        (project: any) =>
          !["completed", "delivered", "cancelled"].includes(project.status),
      ).length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      completedTasks: tasks.filter((task: any) => task.status === "completed")
        .length,
      expenseByCategory: Object.entries(expenseByCategory)
        .map(([key, value]) => ({
          label: EXPENSE_CATEGORY_LABELS[key] || key,
          value,
        }))
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 6),
      projectBuckets: Object.entries(PROJECT_STATUS)
        .map(([key, entry]) => ({
          key,
          label: entry.label,
          value: projects.filter(
            (project: any) => (project.status || "lead") === key,
          ).length,
        }))
        .filter((entry) => entry.value > 0),
      taskBuckets: Object.entries(TASK_STATUS)
        .map(([key, entry]) => ({
          key,
          label: entry.label,
          value: tasks.filter((task: any) => (task.status || "todo") === key).length,
        }))
        .filter((entry) => entry.value > 0),
      dueInvoices: openInvoices(documents).slice(0, 5),
      dueTasks: openTasks
        .filter((task: any) => task.due_date)
        .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)))
        .slice(0, 5),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    );
  }

  const netProfit = metrics.collected - metrics.expenses;

  return (
    <div>
      <DashboardHome user={user} overdueInvoices={metrics.overdueInvoices} tasks={data?.tasks || []} projects={data?.projects || []} />
      <PageHeader
        title="Dashboard"
        description={`${settings.company_name} · money, clients and delivery in one live view, refreshed every 30 seconds.`}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total project value"
          to="/projects"
          value={inr(metrics.projectValue)}
          hint={`${metrics.projects} project(s), excluding cancelled`}
          icon={Briefcase}
          tone="blue"
        />
        <StatCard
          label="Invoiced"
          to="/documents"
          value={inr(metrics.invoiced)}
          hint="All invoices raised"
          icon={IndianRupee}
          tone="violet"
        />
        <StatCard
          label="Collected"
          to="/payments"
          value={inr(metrics.collected)}
          hint="Cash received, net of refunds"
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          label="Expenses"
          to="/expenses"
          value={inr(metrics.expenses)}
          hint="Everything recorded as spend"
          icon={Receipt}
          tone="rose"
        />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:mt-3 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Net profit"
          to="/reports"
          value={inr(netProfit)}
          hint="Collected minus expenses"
          icon={TrendingUp}
          tone={netProfit >= 0 ? "emerald" : "rose"}
        />
        <StatCard
          label="Outstanding"
          to="/documents"
          value={inr(metrics.outstanding)}
          hint={`${metrics.overdueInvoices.length} invoice(s) past due`}
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Clients"
          to="/clients"
          value={metrics.clients}
          hint={`${metrics.activeClients} active`}
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Active projects"
          to="/projects"
          value={metrics.activeProjects}
          hint={`${metrics.projects} total`}
          icon={FolderKanban}
          tone="cyan"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading text-[15px] font-semibold">
                Profit, collections and spending
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Last 12 months · bars are money in and out, the line is profit
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              This month net {inr(metrics.thisMonth.profit)}
            </span>
          </div>
          <MonthlyProfitChart data={metrics.months} />
        </div>

        <div className="surface p-4">
          <h2 className="font-heading text-[15px] font-semibold">This month</h2>
          <p className="text-[11px] text-muted-foreground">
            Calendar month, not a rolling 30 days
          </p>
          <dl className="mt-3 space-y-2 text-[12.5px]">
            {[
              ["Invoiced", inr(metrics.thisMonth.invoiced)],
              ["Collected", inr(metrics.thisMonth.collected)],
              ["Expenses", inr(metrics.thisMonth.expenses)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border/60 pb-1.5"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <dt className="font-semibold">Net</dt>
              <dd
                className={`font-heading text-[14px] font-bold tabular-nums ${metrics.thisMonth.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {inr(metrics.thisMonth.profit)}
              </dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link to="/reports">
              Open full reports <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <h2 className="mb-1 font-heading text-[15px] font-semibold">
            Invoiced vs received
          </h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Are invoices turning into cash?
          </p>
          <CollectionsChart data={metrics.months.slice(-6)} />
        </div>
        <div className="surface p-4">
          <h2 className="mb-1 font-heading text-[15px] font-semibold">
            Where the money goes
          </h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Expenses by category, last 12 months
          </p>
          {metrics.expenseByCategory.length ? (
            <ExpenseCategoryChart data={metrics.expenseByCategory} />
          ) : (
            <EmptyState
              title="No expenses yet"
              description="Record an expense to see the split."
            />
          )}
        </div>
        <div className="surface p-4">
          <h2 className="mb-1 font-heading text-[15px] font-semibold">
            Project status
          </h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            How the pipeline is moving
          </p>
          {metrics.projectBuckets.length ? (
            <DistributionChart data={metrics.projectBuckets} />
          ) : (
            <EmptyState title="No projects yet" />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-[15px] font-semibold">
              Task status
            </h2>
            <Link
              to="/tasks"
              className="text-[11px] text-primary hover:underline"
            >
              All tasks
            </Link>
          </div>
          {metrics.taskBuckets.length ? (
            <DistributionChart data={metrics.taskBuckets} />
          ) : (
            <EmptyState title="No tasks yet" />
          )}
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-[15px] font-semibold">
              Invoices to chase
            </h2>
            {can("payments") && (
              <Link
                to="/payments"
                className="text-[11px] text-primary hover:underline"
              >
                Ledger
              </Link>
            )}
          </div>
          {metrics.dueInvoices.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing outstanding"
              description="Every invoice is settled."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {metrics.dueInvoices.map((doc) => {
                const late = (daysUntil(doc.due_date) ?? 0) < 0;
                return (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/documents/$documentId"
                        params={{ documentId: doc.id }}
                        className="block truncate text-[12.5px] font-medium hover:text-primary"
                      >
                        {doc.client_name || doc.doc_number}
                      </Link>
                      <p
                        className={`text-[11px] ${late ? "text-rose-600" : "text-muted-foreground"}`}
                      >
                        {doc.doc_number} ·{" "}
                        {late ? "overdue" : `due ${fmtDate(doc.due_date)}`}
                      </p>
                    </div>
                    <span className="text-[12.5px] font-semibold tabular-nums">
                      {inr(doc.balance_due)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-[15px] font-semibold">
              Next deadlines
            </h2>
            <Link
              to="/tasks"
              className="text-[11px] text-primary hover:underline"
            >
              Tasks
            </Link>
          </div>
          {metrics.dueTasks.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nothing scheduled"
              description="Tasks with due dates show up here."
            />
          ) : (
            <ul className="space-y-2.5">
              {metrics.dueTasks.map((task: any) => {
                const days = daysUntil(task.due_date);
                return (
                  <li key={task.id} className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">
                        {task.title}
                      </p>
                      <p
                        className={`text-[11px] ${days !== null && days < 0 ? "text-rose-600" : "text-muted-foreground"}`}
                      >
                        {days !== null && days < 0
                          ? `${Math.abs(days)} day(s) late`
                          : `Due ${fmtDate(task.due_date)}`}
                      </p>
                    </div>
                    <StatusBadge
                      status={task.status || "todo"}
                      map={TASK_STATUS}
                      className="ml-auto shrink-0"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { to: "/reports", label: "Monthly report" },
          { to: "/reports/clients", label: "Client status" },
          { to: "/reports/projects", label: "Project status" },
          { to: "/reports/tasks", label: "Task status" },
          { to: "/reports/expenses", label: "Expense status" },
        ].map((link) => (
          <Button key={link.to} asChild variant="outline" size="sm">
            <Link to={link.to}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
