import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Receipt, TrendingDown } from "lucide-react";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ReportSectionHeader from "@/components/reports/ReportSectionHeader";
import { ExpenseTrendChart } from "@/components/common/LazyCharts";
import { ExpenseCategoryChart } from "@/components/common/LazyCharts";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import {
  expenseStatus,
  monthSeries,
  reportQueryOptions,
  sumBy,
} from "@/lib/report-data";
import { downloadCsv, fmtDate, inr, monthKey, num, toCsv } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/reports/expenses")({
  head: () => ({
    meta: [{ title: "Expense status report · WorkManager" }],
  }),
  component: ExpenseReportPage,
});

function ExpenseReportPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const { data, isLoading } = useQuery(reportQueryOptions);

  const report = useMemo(() => {
    const expenses = data?.expenses || [];
    const projects = data?.projects || [];
    const months = monthSeries(data || {}, 12);
    const currentKey = monthKey(new Date());

    const rows = expenses
      .map((expense: any) => ({
        expense,
        status: expenseStatus(expense),
        projectName:
          projects.find((project: any) => project.id === expense.project_id)
            ?.title || "—",
      }))
      .sort((a: any, b: any) =>
        String(b.expense.expense_date || "").localeCompare(
          String(a.expense.expense_date || ""),
        ),
      );

    const categoryMap: Record<string, any> = {};
    expenses
      .filter((expense: any) =>
        months.some((month) => month.key === monthKey(expense.expense_date)),
      )
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

    return {
      rows,
      months,
      categoryData,
      total: sumBy(rows, (row: any) => row.expense.amount),
      thisMonth: sumBy(
        rows.filter((row: any) => monthKey(row.expense.expense_date) === currentKey),
        (row: any) => row.expense.amount,
      ),
      pending: sumBy(
        rows.filter((row: any) => row.status === "pending"),
        (row: any) => row.expense.amount,
      ),
      pendingCount: rows.filter((row: any) => row.status === "pending").length,
      topCategory: categoryData[0],
      count: rows.length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return report.rows
      .filter((row: any) => (status === "all" ? true : row.status === status))
      .filter((row: any) =>
        category === "all" ? true : row.expense.category === category,
      )
      .filter((row: any) => {
        if (!term) return true;
        return [
          row.expense.title,
          row.expense.expense_code,
          row.expense.vendor,
          row.projectName,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
  }, [report.rows, search, status, category]);

  if (isLoading) return <Skeleton className="h-[480px] rounded-xl" />;

  const exportCsv = () =>
    downloadCsv(
      `expense-status-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, [
        {
          label: "Expense code",
          value: (row: any) => row.expense.expense_code || "",
        },
        { label: "Expense", value: (row: any) => row.expense.title },
        {
          label: "Category",
          value: (row: any) =>
            EXPENSE_CATEGORY_LABELS[row.expense.category] ||
            row.expense.category ||
            "",
        },
        { label: "Vendor", value: (row: any) => row.expense.vendor || "" },
        { label: "Project", value: (row: any) => row.projectName },
        {
          label: "Paid via",
          value: (row: any) =>
            PAYMENT_METHOD_LABELS[row.expense.payment_method] || "",
        },
        {
          label: "Status",
          value: (row: any) => (EXPENSE_STATUS as Record<string, any>)[row.status]?.label || row.status,
        },
        { label: "Date", value: (row: any) => row.expense.expense_date || "" },
        {
          label: "Amount (INR)",
          value: (row: any) => num(row.expense.amount).toFixed(2),
        },
      ]),
    );

  const filteredTotal = sumBy(filtered, (row: any) => row.expense.amount);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total spend"
          value={inr(report.total)}
          hint={`${report.count} expenses recorded`}
          icon={Receipt}
          tone="rose"
        />
        <StatCard
          label="This month"
          value={inr(report.thisMonth)}
          hint="Recorded spend in the current month"
          icon={CalendarClock}
          tone="violet"
        />
        <StatCard
          label="Pending payment"
          value={inr(report.pending)}
          hint={`${report.pendingCount} marked pending`}
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="Biggest category"
          value={report.topCategory ? report.topCategory.label : "—"}
          hint={
            report.topCategory
              ? `${inr(report.topCategory.value)} in the last 12 months`
              : "No expenses yet"
          }
          icon={TrendingDown}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <ReportSectionHeader
            title="Spend trend"
            description="Monthly expenses against net after spend, last 12 months"
          />
          <ExpenseTrendChart data={report.months} />
        </div>
        <div className="surface p-4">
          <ReportSectionHeader
            title="By category"
            description="Last 12 months"
          />
          {report.categoryData.length ? (
            <ExpenseCategoryChart data={report.categoryData} />
          ) : (
            <EmptyState
              title="No expenses yet"
              description="Add an expense to see the split."
            />
          )}
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="All expenses and their status"
          description={`${filtered.length} of ${report.count} expenses · ${inr(filteredTotal)}`}
        >
          <Input
            placeholder="Search expenses…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-[180px] bg-card text-[12.5px]"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[130px] bg-card text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(EXPENSE_STATUS).map(([key, entry]) => (
                <SelectItem key={key} value={key}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[150px] bg-card text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            Export CSV
          </Button>
        </ReportSectionHeader>

        {filtered.length === 0 ? (
          <EmptyState
            title="No expenses match this view"
            description="Clear the filters or record a new expense."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Expense
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Category
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Vendor / project
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Paid via
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => (
                  <TableRow key={row.expense.id}>
                    <TableCell className="max-w-[220px]">
                      <p className="truncate text-[12.5px] font-medium">
                        {row.expense.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.expense.expense_code || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">
                      {EXPENSE_CATEGORY_LABELS[row.expense.category] || "—"}
                    </TableCell>
                    <TableCell className="max-w-[180px] text-[12px] text-muted-foreground">
                      <p className="truncate">{row.expense.vendor || "—"}</p>
                      {row.expense.project_id ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.expense.project_id }}
                          className="truncate hover:text-primary"
                        >
                          {row.projectName}
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[row.expense.payment_method] || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} map={EXPENSE_STATUS} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                      {fmtDate(row.expense.expense_date)}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] font-medium tabular-nums">
                      {inr(row.expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
