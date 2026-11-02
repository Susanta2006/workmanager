import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ListChecks, Timer } from "lucide-react";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ReportSectionHeader from "@/components/reports/ReportSectionHeader";
import { DistributionChart } from "@/components/common/LazyCharts";
import { PRIORITY, TASK_STATUS } from "@/lib/constants";
import { reportQueryOptions } from "@/lib/report-data";
import { daysUntil, downloadCsv, fmtDate, pct, toCsv } from "@/lib/format";
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

export const Route = createFileRoute("/_authed/reports/tasks")({
  head: () => ({
    meta: [{ title: "Task status report · WorkManager" }],
  }),
  component: TaskReportPage,
});

function TaskReportPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery(reportQueryOptions);

  const report = useMemo(() => {
    const tasks = data?.tasks || [];
    const projects = data?.projects || [];
    const clients = data?.clients || [];

    const rows = tasks.map((task: any) => {
      const project = projects.find((item: any) => item.id === task.project_id);
      const remaining = daysUntil(task.due_date);
      return {
        task,
        projectName:
          project?.title ||
          (task.client_id
            ? clients.find((client: any) => client.id === task.client_id)?.name
            : "") ||
          "—",
        remaining,
        overdue:
          remaining !== null &&
          remaining < 0 &&
          !["completed", "cancelled"].includes(task.status),
      };
    });

    const statusCounts = Object.keys(TASK_STATUS).map((key) => ({
      key,
      label: (TASK_STATUS as Record<string, any>)[key].label,
      count: tasks.filter((task: any) => (task.status || "todo") === key).length,
    }));

    return {
      rows,
      statusCounts,
      total: tasks.length,
      completed: tasks.filter((task: any) => task.status === "completed").length,
      inProgress: tasks.filter((task: any) => task.status === "in_progress").length,
      overdue: rows.filter((row: any) => row.overdue).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return report.rows
      .filter((row: any) =>
        status === "all" ? true : (row.task.status || "todo") === status,
      )
      .filter((row: any) => {
        if (!term) return true;
        return [row.task.title, row.projectName, row.task.assigned_to]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a: any, b: any) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return String(a.task.due_date || "9999").localeCompare(
          String(b.task.due_date || "9999"),
        );
      });
  }, [report.rows, search, status]);

  if (isLoading) return <Skeleton className="h-[480px] rounded-xl" />;

  const exportCsv = () =>
    downloadCsv(
      `task-status-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, [
        { label: "Task", value: (row: any) => row.task.title },
        { label: "Project", value: (row: any) => row.projectName },
        { label: "Assignee", value: (row: any) => row.task.assigned_to || "" },
        {
          label: "Status",
          value: (row: any) => (TASK_STATUS as Record<string, any>)[row.task.status || "todo"]?.label || "",
        },
        {
          label: "Priority",
          value: (row: any) => (PRIORITY as Record<string, any>)[row.task.priority || "medium"]?.label || "",
        },
        { label: "Start", value: (row: any) => row.task.start_date || "" },
        { label: "Due", value: (row: any) => row.task.due_date || "" },
        { label: "Overdue", value: (row: any) => (row.overdue ? "Yes" : "No") },
      ]),
    );

  const chartData = report.statusCounts
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ label: entry.label, value: entry.count }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total tasks"
          value={report.total}
          hint="Across every project"
          icon={ListChecks}
          tone="blue"
        />
        <StatCard
          label="Completed"
          value={report.completed}
          hint={`${pct(report.completed, report.total)}% of all tasks`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="In progress"
          value={report.inProgress}
          hint="Being worked on right now"
          icon={Timer}
          tone="violet"
        />
        <StatCard
          label="Overdue"
          value={report.overdue}
          hint="Past due and still open"
          icon={AlertTriangle}
          tone="rose"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <ReportSectionHeader title="Tasks by status" />
          {chartData.length ? (
            <DistributionChart data={chartData} />
          ) : (
            <EmptyState title="No tasks yet" />
          )}
        </div>
        <div className="surface p-4 lg:col-span-2">
          <ReportSectionHeader
            title="Status breakdown"
            description="Live counts from the task board"
          />
          <div className="space-y-2">
            {report.statusCounts.map((entry) => {
              const share = report.total
                ? Math.round((entry.count / report.total) * 100)
                : 0;
              return (
                <div key={entry.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12px] text-muted-foreground">
                    {entry.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[12px] font-medium tabular-nums">
                    {entry.count} · {share}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="surface mt-4 p-4">
        <ReportSectionHeader
          title="All tasks and their status"
          description={`${filtered.length} of ${report.total} tasks`}
        >
          <Input
            placeholder="Search tasks…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-[190px] bg-card text-[12.5px]"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px] bg-card text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(TASK_STATUS).map(([key, entry]) => (
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
            title="No tasks match this view"
            description="Clear the search or pick another status."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Task
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Project
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Assigned
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Priority
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Due
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => (
                  <TableRow key={row.task.id}>
                    <TableCell className="max-w-[260px]">
                      <p className="truncate text-[12.5px] font-medium">
                        {row.task.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        {row.task.completed_date
                          ? `Done ${fmtDate(row.task.completed_date)}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-[12.5px] text-muted-foreground">
                      {row.task.project_id ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.task.project_id }}
                          className="hover:text-primary"
                        >
                          {row.projectName}
                        </Link>
                      ) : (
                        row.projectName
                      )}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-[12px] text-muted-foreground">
                      {row.task.assigned_to || "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.task.status || "todo"}
                        map={TASK_STATUS}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.task.priority || "medium"}
                        map={PRIORITY}
                      />
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-[12.5px] ${row.overdue ? "font-medium text-rose-600" : "text-muted-foreground"}`}
                    >
                      {fmtDate(row.task.due_date)}
                      {row.overdue && (
                        <span className="ml-1 text-[11px]">
                          ({Math.abs(row.remaining)}d late)
                        </span>
                      )}
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
