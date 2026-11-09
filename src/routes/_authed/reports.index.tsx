import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarRange,
  IndianRupee,
  Receipt,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import StatCard from "@/components/common/StatCard";
import EmptyState from "@/components/common/EmptyState";
import ReportSectionHeader from "@/components/reports/ReportSectionHeader";
import {
  MonthlyProfitChart,
  YearlyProfitChart,
} from "@/components/common/LazyCharts";
import { ExpenseCategoryChart } from "@/components/common/LazyCharts";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import {
  reportQueryOptions,
  monthSeries,
  yearSeries,
  openInvoices,
  sumBy,
} from "@/lib/report-data";
import {
  downloadCsv,
  fmtDate,
  inr,
  num,
  pct,
  toCsv,
  monthKey,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/reports/")({
  head: () => ({
    meta: [{ title: "Profit & expense reports · WorkManager" }],
  }),
  component: FinancialReportsPage,
});

function FinancialReportsPage() {
  const { data, isLoading } = useQuery(reportQueryOptions);

  const report = useMemo(() => {
    const months = monthSeries(data || {}, 12);
    const years = yearSeries(data || {});
    const invoices = (data?.documents || []).filter(
      (d: any) => d.doc_type === "invoice" && d.status !== "cancelled",
    );
    const expenses = data?.expenses || [];
    const clients = data?.clients || [];

    const currentMonth = months[months.length - 1];
    const totals = {
      invoiced: sumBy(months, (m: any) => m.invoiced),
      collected: sumBy(months, (m: any) => m.collected),
      refunds: sumBy(months, (m: any) => m.refunds),
      expenses: sumBy(months, (m: any) => m.expenses),
      profit: sumBy(months, (m: any) => m.profit),
    };

    const now = new Date();
    const thisYearKey = String(now.getFullYear());
    const thisYear = years.find((y) => y.key === thisYearKey) || {
      key: thisYearKey,
      collected: 0,
      refunds: 0,
      expenses: 0,
      profit: 0,
      invoiced: 0,
    };

    const recentKeys = new Set(months.map((m) => m.key));
    const categoryMap: Record<string, any> = {};
    expenses
      .filter((e: any) => recentKeys.has(monthKey(e.expense_date)))
      .forEach((expense: any) => {
        (categoryMap as Record<string, any>)[expense.category] =
          ((categoryMap as Record<string, any>)[expense.category] || 0) + num(expense.amount);
      });
    const categoryData = Object.entries(categoryMap)
      .map(([key, value]) => ({
        label: EXPENSE_CATEGORY_LABELS[key] || key,
        value,
      }))
      .sort((a: any, b: any) => b.value - a.value);

    const open = openInvoices(data?.documents || []);
    const bestMonth = months.reduce(
      (best, m) => (m.profit > (best?.profit ?? -Infinity) ? m : best),
      null,
    );

    return {
      months,
      years,
      totals,
      currentMonth,
      thisYear,
      categoryData,
      open,
      outstanding: sumBy(open, (d: any) => d.balance_due),
      clients,
      invoices,
      bestMonth,
    };
  }, [data]);

  if (isLoading) return <Skeleton className="h-[520px] rounded-xl" />;

  const exportMonthly = () => {
    downloadCsv(
      `monthly-profit-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(report.months, [
        { label: "Month", value: (m: any) => m.label },
        { label: "Invoiced (INR)", value: (m: any) => m.invoiced.toFixed(2) },
        { label: "Collected (INR)", value: (m: any) => m.collected.toFixed(2) },
        { label: "Refunds (INR)", value: (m: any) => m.refunds.toFixed(2) },
        { label: "Expenses (INR)", value: (m: any) => m.expenses.toFixed(2) },
        { label: "Net profit / (loss) (INR)", value: (m: any) => m.profit.toFixed(2) },
        { label: "Margin %", value: (m: any) => pct(m.profit, m.invoiced) },
      ]),
    );
  };

  const exportAnnual = () => {
    downloadCsv(
      `annual-report-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(report.years, [
        { label: "Year", value: (y: any) => y.key },
        { label: "Invoiced (INR)", value: (y: any) => y.invoiced.toFixed(2) },
        { label: "Collected (INR)", value: (y: any) => y.collected.toFixed(2) },
        { label: "Refunds (INR)", value: (y: any) => y.refunds.toFixed(2) },
        { label: "Expenses (INR)", value: (y: any) => y.expenses.toFixed(2) },
        { label: "Net profit / (loss) (INR)", value: (y: any) => y.profit.toFixed(2) },
        { label: "Margin %", value: (y: any) => pct(y.profit, y.invoiced) },
      ]),
    );
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label={`${report.currentMonth.profit > 0 ? "Profit" : report.currentMonth.profit < 0 ? "Loss" : "Break-even"} this month`}
          value={inr(report.currentMonth.profit)}
          hint={`${report.currentMonth.label} · invoiced revenue less refunds and expenses`}
          icon={report.currentMonth.profit > 0 ? TrendingUp : report.currentMonth.profit < 0 ? TrendingDown : Minus}
          tone={report.currentMonth.profit > 0 ? "emerald" : report.currentMonth.profit < 0 ? "rose" : "slate"}
        />
        <StatCard
          label={`${report.thisYear.profit > 0 ? "Profit" : report.thisYear.profit < 0 ? "Loss" : "Break-even"} ${report.thisYear.key}`}
          value={inr(report.thisYear.profit)}
          hint="Recognized invoiced revenue less refunds and expenses"
          icon={report.thisYear.profit > 0 ? TrendingUp : report.thisYear.profit < 0 ? TrendingDown : Minus}
          tone={report.thisYear.profit > 0 ? "emerald" : report.thisYear.profit < 0 ? "rose" : "slate"}
        />
        <StatCard
          label="Expenses this month"
          value={inr(report.currentMonth.expenses)}
          hint="Recorded spend in the current month"
          icon={Receipt}
          tone="rose"
        />
        <StatCard
          label="Outstanding"
          value={inr(report.outstanding)}
          hint={`${report.open.length} open invoice${report.open.length === 1 ? "" : "s"}`}
          icon={IndianRupee}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <ReportSectionHeader
            title="Monthly profit trend"
            description="Recognized invoice revenue minus refunds and recorded expenses, last 12 months"
          />
          <MonthlyProfitChart data={report.months} />
        </div>
        <div className="surface p-4">
          <ReportSectionHeader
            title="Where money went"
            description="Expenses by category, last 12 months"
          />
          {report.categoryData.length ? (
            <ExpenseCategoryChart data={report.categoryData} />
          ) : (
            <EmptyState
              title="No expenses yet"
              description="Add an expense to see the breakdown."
            />
          )}
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="Monthly report"
          description={`${report.months[0].label} → ${report.months[report.months.length - 1].label} · accrual result = invoiced revenue − refunds − expenses`}
        >
          <Button variant="outline" size="sm" onClick={exportMonthly}>
            Monthly CSV
          </Button>
        </ReportSectionHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Month
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Invoiced
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Collected
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Refunds
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Expenses
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Profit
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                  Margin
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.months.map((month) => (
                <TableRow
                  key={month.key}
                  className={
                    month.key === report.currentMonth.key
                      ? "bg-accent/40"
                      : undefined
                  }
                >
                  <TableCell className="whitespace-nowrap text-[12.5px] font-medium">
                    {month.label}
                    {month.key === report.currentMonth.key && (
                      <span className="ml-2 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        current
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[12.5px] tabular-nums text-muted-foreground">
                    {inr(month.invoiced)}
                  </TableCell>
                  <TableCell className="text-right text-[12.5px] tabular-nums">
                    {inr(month.collected)}
                  </TableCell>
                  <TableCell className="text-right text-[12.5px] tabular-nums text-rose-600">{inr(month.refunds)}</TableCell>
                  <TableCell className={`text-right text-[12.5px] tabular-nums ${month.expenses > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                    {inr(month.expenses)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-[12.5px] font-semibold tabular-nums ${month.profit > 0 ? "text-emerald-700" : month.profit < 0 ? "text-rose-600" : "text-muted-foreground"}`}
                  >
                    {inr(month.profit)}
                  </TableCell>
                  <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">
                    {pct(month.profit, month.invoiced)}%
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary/60">
                <TableCell className="text-[12.5px] font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right text-[12.5px] font-semibold tabular-nums">
                  {inr(report.totals.invoiced)}
                </TableCell>
                <TableCell className="text-right text-[12.5px] font-semibold tabular-nums">
                  {inr(report.totals.collected)}
                </TableCell>
                <TableCell className="text-right text-[12.5px] font-semibold tabular-nums text-rose-600">{inr(report.totals.refunds)}</TableCell>
                <TableCell className={`text-right text-[12.5px] font-semibold tabular-nums ${report.totals.expenses > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                  {inr(report.totals.expenses)}
                </TableCell>
                <TableCell
                  className={`text-right text-[12.5px] font-bold tabular-nums ${report.totals.profit > 0 ? "text-emerald-700" : report.totals.profit < 0 ? "text-rose-600" : "text-muted-foreground"}`}
                >
                  {inr(report.totals.profit)}
                </TableCell>
                <TableCell className="text-right text-[12px] font-semibold tabular-nums">
                  {pct(report.totals.profit, report.totals.invoiced)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="Annual report"
          description="Each year uses invoice issue dates, refund dates and expense dates (accrual basis)"
        >
          <Button variant="outline" size="sm" onClick={exportAnnual}>
            Annual CSV
          </Button>
        </ReportSectionHeader>
        {report.years.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No yearly data yet"
            description="Years appear once you record issued invoices, refunds or expenses."
          />
        ) : (
          <YearlyProfitChart data={report.years} />
        )}
        {report.years.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Year
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Invoiced
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Collected
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Refunds
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Expenses
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Profit / (loss)
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Invoiced growth
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.years.map((year, index) => {
                  const previous = report.years[index - 1];
                  const growth =
                    previous && previous.invoiced > 0
                      ? Math.round(
                          ((year.invoiced - previous.invoiced) /
                            previous.invoiced) *
                            100,
                        )
                      : null;
                  return (
                    <TableRow key={year.key}>
                      <TableCell className="text-[12.5px] font-medium">
                        {year.key}
                        {year.key === report.thisYear.key && (
                          <span className="ml-2 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            YTD
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[12.5px] tabular-nums text-muted-foreground">
                        {inr(year.invoiced)}
                      </TableCell>
                      <TableCell className="text-right text-[12.5px] tabular-nums">
                        {inr(year.collected)}
                      </TableCell>
                      <TableCell className="text-right text-[12.5px] tabular-nums text-rose-600">{inr(year.refunds)}</TableCell>
                      <TableCell className={`text-right text-[12.5px] tabular-nums ${year.expenses > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                        {inr(year.expenses)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-[12.5px] font-semibold tabular-nums ${year.profit > 0 ? "text-emerald-700" : year.profit < 0 ? "text-rose-600" : "text-muted-foreground"}`}
                      >
                        {inr(year.profit)}
                      </TableCell>
                      <TableCell className="text-right text-[12px] tabular-nums text-muted-foreground">
                        {growth === null
                          ? "—"
                          : `${growth >= 0 ? "+" : ""}${growth}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="Open & overdue invoices"
          description="Money still to be collected, soonest due first"
        />
        {report.open.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No unpaid invoices — everything issued has been settled.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Due
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.open.map((invoice) => {
                  const overdue =
                    invoice.due_date &&
                    new Date(invoice.due_date) <
                      new Date(new Date().toDateString());
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="whitespace-nowrap text-[12.5px]">
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: invoice.id }}
                          className="font-medium hover:text-primary"
                        >
                          {invoice.doc_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[12.5px]">
                        {report.clients.find((c: any) => c.id === invoice.client_id)
                          ?.name || "—"}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap text-[12.5px] ${overdue ? "font-medium text-rose-600" : "text-muted-foreground"}`}
                      >
                        {fmtDate(invoice.due_date)}
                      </TableCell>
                      <TableCell className="text-right text-[12.5px] tabular-nums">
                        {inr(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right text-[12.5px] font-semibold tabular-nums text-amber-700">
                        {inr(invoice.balance_due)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
