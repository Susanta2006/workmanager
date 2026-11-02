import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FolderKanban, Loader2, TrendingUp } from "lucide-react";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ReportSectionHeader from "@/components/reports/ReportSectionHeader";
import { DistributionChart } from "@/components/common/LazyCharts";
import {
  ACTIVE_PROJECT_STATUSES,
  PRIORITY,
  PROJECT_STATUS,
} from "@/lib/constants";
import { cashOf, reportQueryOptions, sumBy } from "@/lib/report-data";
import {
  daysUntil,
  downloadCsv,
  fmtDate,
  inr,
  num,
  pct,
  toCsv,
} from "@/lib/format";
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

export const Route = createFileRoute("/_authed/reports/projects")({
  head: () => ({
    meta: [{ title: "Project status report · WorkManager" }],
  }),
  component: ProjectReportPage,
});

function ProjectReportPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery(reportQueryOptions);

  const report = useMemo(() => {
    const projects = data?.projects || [];
    const clients = data?.clients || [];
    const payments = data?.payments || [];
    const expenses = data?.expenses || [];

    const rows = projects.map((project: any) => {
      const collected = cashOf(
        payments.filter((payment: any) => payment.project_id === project.id),
      );
      const spent = sumBy(
        expenses.filter((expense: any) => expense.project_id === project.id),
        (expense: any) => expense.amount,
      );
      return {
        project,
        clientName:
          clients.find((client: any) => client.id === project.client_id)?.name ||
          "—",
        collected,
        spent,
        value: num(project.project_value),
        overdue:
          project.deadline &&
          !["completed", "delivered", "cancelled"].includes(project.status) &&
          (daysUntil(project.deadline) ?? 0) < 0,
      };
    });

    const statusCounts = Object.keys(PROJECT_STATUS).map((key) => ({
      key,
      label: (PROJECT_STATUS as Record<string, any>)[key].label,
      count: projects.filter((project: any) => (project.status || "lead") === key)
        .length,
    }));

    return {
      rows,
      statusCounts,
      total: projects.length,
      active: projects.filter((project: any) =>
        ACTIVE_PROJECT_STATUSES.includes(project.status),
      ).length,
      completed: projects.filter((project: any) =>
        ["completed", "delivered"].includes(project.status),
      ).length,
      overdue: rows.filter((row: any) => row.overdue).length,
      value: sumBy(rows, (row: any) => row.value),
      collected: sumBy(rows, (row: any) => row.collected),
      spent: sumBy(rows, (row: any) => row.spent),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return report.rows
      .filter((row: any) =>
        status === "all" ? true : (row.project.status || "lead") === status,
      )
      .filter((row: any) => {
        if (!term) return true;
        return [
          row.project.title,
          row.project.project_code,
          row.clientName,
          row.project.service_category,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a: any, b: any) => b.value - a.value);
  }, [report.rows, search, status]);

  if (isLoading) return <Skeleton className="h-[480px] rounded-xl" />;

  const exportCsv = () =>
    downloadCsv(
      `project-status-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, [
        {
          label: "Project code",
          value: (row: any) => row.project.project_code || "",
        },
        { label: "Project", value: (row: any) => row.project.title },
        { label: "Client", value: (row: any) => row.clientName },
        {
          label: "Status",
          value: (row: any) =>
            (PROJECT_STATUS as Record<string, any>)[row.project.status || "lead"]?.label || "",
        },
        {
          label: "Priority",
          value: (row: any) =>
            (PRIORITY as Record<string, any>)[row.project.priority || "medium"]?.label || "",
        },
        { label: "Progress %", value: (row: any) => num(row.project.progress) },
        { label: "Project value (INR)", value: (row: any) => row.value.toFixed(2) },
        { label: "Collected (INR)", value: (row: any) => row.collected.toFixed(2) },
        { label: "Expenses (INR)", value: (row: any) => row.spent.toFixed(2) },
        { label: "Deadline", value: (row: any) => row.project.deadline || "" },
      ]),
    );

  const chartData = report.statusCounts
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ label: entry.label, value: entry.count }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total projects"
          value={report.total}
          hint={`${report.active} active · ${report.completed} finished`}
          icon={FolderKanban}
          tone="blue"
        />
        <StatCard
          label="Contracted value"
          value={inr(report.value)}
          hint="Sum of project values"
          icon={TrendingUp}
          tone="violet"
        />
        <StatCard
          label="Collected"
          value={inr(report.collected)}
          hint={`Expenses ${inr(report.spent)}`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Past deadline"
          value={report.overdue}
          hint="Open projects beyond their deadline"
          icon={Loader2}
          tone="rose"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <ReportSectionHeader title="Projects by status" />
          {chartData.length ? (
            <DistributionChart data={chartData} />
          ) : (
            <EmptyState title="No projects yet" />
          )}
        </div>
        <div className="surface p-4 lg:col-span-2">
          <ReportSectionHeader
            title="Status breakdown"
            description="Updates as project statuses move"
          />
          <div className="space-y-2">
            {report.statusCounts
              .filter((entry) => entry.count > 0)
              .map((entry) => {
                const share = report.total
                  ? Math.round((entry.count / report.total) * 100)
                  : 0;
                return (
                  <div key={entry.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[12px] text-muted-foreground">
                      {entry.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--brand-violet))]"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[12px] font-medium tabular-nums">
                      {entry.count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="All projects and their status"
          description={`${filtered.length} of ${report.total} projects`}
        >
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-[190px] bg-card text-[12.5px]"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[150px] bg-card text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(PROJECT_STATUS).map(([key, entry]) => (
                <SelectItem key={key} value={key}>
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
            title="No projects match this view"
            description="Clear the search or pick another status."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Project
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Progress
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Value
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Collected
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Deadline
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => (
                  <TableRow key={row.project.id}>
                    <TableCell className="text-[12.5px]">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: row.project.id }}
                        className="font-medium hover:text-primary"
                      >
                        {row.project.title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {row.project.project_code || "—"}
                        <StatusBadge
                          status={row.project.priority || "medium"}
                          map={PRIORITY}
                          className="scale-90"
                        />
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-[12.5px] text-muted-foreground">
                      {row.clientName}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.project.status || "lead"}
                        map={PROJECT_STATUS}
                      />
                    </TableCell>
                    <TableCell className="min-w-[110px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, num(row.project.progress))}%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {pct(row.project.progress, 100)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">
                      {inr(row.value)}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums text-emerald-700">
                      {inr(row.collected)}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-[12.5px] ${row.overdue ? "font-medium text-rose-600" : "text-muted-foreground"}`}
                    >
                      {fmtDate(row.project.deadline)}
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
