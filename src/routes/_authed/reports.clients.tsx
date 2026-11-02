import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, UserCheck, UserPlus, Users } from "lucide-react";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ReportSectionHeader from "@/components/reports/ReportSectionHeader";
import { DistributionChart } from "@/components/common/LazyCharts";
import { CLIENT_STATUS } from "@/lib/constants";
import {
  cashOf,
  liveInvoices,
  reportQueryOptions,
  sumBy,
} from "@/lib/report-data";
import { downloadCsv, inr, num, toCsv } from "@/lib/format";
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

export const Route = createFileRoute("/_authed/reports/clients")({
  head: () => ({
    meta: [{ title: "Client status report · WorkManager" }],
  }),
  component: ClientReportPage,
});

function ClientReportPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery(reportQueryOptions);

  const report = useMemo(() => {
    const clients = data?.clients || [];
    const invoices = liveInvoices(data?.documents || []);
    const payments = data?.payments || [];
    const projects = data?.projects || [];

    const rows = clients.map((client: any) => {
      const clientInvoices = invoices.filter(
        (doc) => doc.client_id === client.id,
      );
      const clientProjects = projects.filter(
        (project: any) => project.client_id === client.id,
      );
      const outstanding = clientInvoices
        .filter((doc) => !["draft", "paid"].includes(doc.status))
        .reduce((sum, doc) => sum + num(doc.balance_due), 0);
      return {
        client,
        projects: clientProjects.length,
        activeProjects: clientProjects.filter((project: any) =>
          ["in_progress", "under_review", "awaiting_advance"].includes(
            project.status,
          ),
        ).length,
        invoiced: sumBy(clientInvoices, (doc: any) => doc.total),
        received: cashOf(
          payments.filter((payment: any) => payment.client_id === client.id),
        ),
        outstanding,
      };
    });

    const statusCounts = Object.keys(CLIENT_STATUS).map((key) => ({
      key,
      label: (CLIENT_STATUS as Record<string, any>)[key].label,
      count: clients.filter((client: any) => (client.status || "active") === key)
        .length,
    }));

    return {
      rows,
      statusCounts,
      total: clients.length,
      active: clients.filter(
        (client: any) => (client.status || "active") === "active",
      ).length,
      leads: clients.filter((client: any) => client.status === "lead").length,
      outstanding: sumBy(rows, (row: any) => row.outstanding),
      invoiced: sumBy(rows, (row: any) => row.invoiced),
      received: sumBy(rows, (row: any) => row.received),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return report.rows
      .filter((row: any) =>
        status === "all" ? true : (row.client.status || "active") === status,
      )
      .filter((row: any) => {
        if (!term) return true;
        return [
          row.client.name,
          row.client.client_code,
          row.client.email,
          row.client.contact_person,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a: any, b: any) => b.received - a.received);
  }, [report.rows, search, status]);

  if (isLoading) return <Skeleton className="h-[480px] rounded-xl" />;

  const exportCsv = () =>
    downloadCsv(
      `client-status-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, [
        { label: "Client code", value: (row: any) => row.client.client_code || "" },
        { label: "Client", value: (row: any) => row.client.name },
        {
          label: "Status",
          value: (row: any) =>
            (CLIENT_STATUS as Record<string, any>)[row.client.status || "active"]?.label || "Active",
        },
        {
          label: "Contact person",
          value: (row: any) => row.client.contact_person || "",
        },
        { label: "Email", value: (row: any) => row.client.email || "" },
        { label: "Phone", value: (row: any) => row.client.phone || "" },
        { label: "Projects", value: (row: any) => row.projects },
        { label: "Invoiced (INR)", value: (row: any) => row.invoiced.toFixed(2) },
        { label: "Received (INR)", value: (row: any) => row.received.toFixed(2) },
        {
          label: "Outstanding (INR)",
          value: (row: any) => row.outstanding.toFixed(2),
        },
      ]),
    );

  const chartData = report.statusCounts
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ label: entry.label, value: entry.count }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total clients"
          value={report.total}
          hint={`${report.leads} lead${report.leads === 1 ? "" : "s"} in the pipeline`}
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Active clients"
          value={report.active}
          hint="Currently marked active"
          icon={UserCheck}
          tone="emerald"
        />
        <StatCard
          label="Billed to clients"
          value={inr(report.invoiced)}
          hint={`Received ${inr(report.received)}`}
          icon={UserPlus}
          tone="violet"
        />
        <StatCard
          label="Client receivables"
          value={inr(report.outstanding)}
          hint="Unpaid invoice balances"
          icon={IndianRupee}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4">
          <ReportSectionHeader title="Clients by status" />
          {chartData.length ? (
            <DistributionChart data={chartData} />
          ) : (
            <EmptyState title="No clients yet" />
          )}
        </div>
        <div className="surface p-4 lg:col-span-2">
          <ReportSectionHeader
            title="Status breakdown"
            description="Counts refresh automatically as client statuses change"
          />
          <div className="space-y-2">
            {report.statusCounts.map((entry) => {
              const share = report.total
                ? Math.round((entry.count / report.total) * 100)
                : 0;
              return (
                <div key={entry.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[12px] text-muted-foreground">
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
          title="All clients and their status"
          description={`${filtered.length} of ${report.total} clients`}
        >
          <Input
            placeholder="Search clients…"
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
              {Object.entries(CLIENT_STATUS).map(([key, entry]) => (
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
            title="No clients match this view"
            description="Clear the search or pick another status."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Contact
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Projects
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Invoiced
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Received
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => (
                  <TableRow key={row.client.id}>
                    <TableCell className="text-[12.5px]">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: row.client.id }}
                        className="font-medium hover:text-primary"
                      >
                        {row.client.name}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {row.client.client_code || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      <p className="max-w-[180px] truncate">
                        {row.client.email || "—"}
                      </p>
                      <p>{row.client.phone || ""}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.client.status || "active"}
                        map={CLIENT_STATUS}
                      />
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">
                      {row.projects}
                      {row.activeProjects > 0 && (
                        <span className="ml-1 text-[11px] text-primary">
                          ({row.activeProjects} live)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums text-muted-foreground">
                      {inr(row.invoiced)}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">
                      {inr(row.received)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-[12.5px] font-medium tabular-nums ${row.outstanding > 0 ? "text-amber-700" : "text-muted-foreground"}`}
                    >
                      {inr(row.outstanding)}
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
