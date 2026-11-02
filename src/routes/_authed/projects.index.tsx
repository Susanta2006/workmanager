import { refreshWorkspaceData } from "@/lib/sync";
import ClientRef from "@/components/common/ClientRef";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react";
import { fetchAll } from "@/lib/db";
import {
  PROJECT_STATUS,
  PROJECT_STATUS_ORDER,
  SERVICE_CATEGORIES,
} from "@/lib/constants";
import { daysUntil, fmtDate, inr, num } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import ProjectDialog from "@/components/projects/ProjectDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchClients } from "@/lib/clients";
import { validateNewRecordSearch } from "@/lib/new-record-search";

export const Route = createFileRoute("/_authed/projects/")({
  validateSearch: validateNewRecordSearch,
  head: () => ({ meta: [{ title: "Projects · WorkManager" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [clientId, setClientId] = useState("all");
  const prefill = Route.useSearch();
  const [dialog, setDialog] = useState<any>(() => ({
    open: prefill.new === true,
    project: null as any,
    clientId: prefill.client,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ["projects-page"],
    queryFn: async () => {
      const [projects, clients, payments] = await Promise.all([
        fetchAll("Project", null),
        fetchClients(),
        fetchAll("Payment", null),
      ]);
      return { projects, clients, payments };
    },
  });

  const rows = useMemo(() => {
    const projects = data?.projects || [];
    const payments = data?.payments || [];
    const clientsById = Object.fromEntries(
      (data?.clients || []).map((c: any) => [c.id, c]),
    );
    return projects
      .filter((project: any) => {
        const haystack =
          `${project.title} ${project.project_code}`.toLowerCase();
        if (search && !haystack.includes(search.toLowerCase())) return false;
        if (status !== "all" && project.status !== status) return false;
        if (clientId !== "all" && project.client_id !== clientId) return false;
        return true;
      })
      .map((project: any) => {
        const received = payments
          .filter((p: any) => p.project_id === project.id)
          .reduce(
            (sum: any, p: any) =>
              p.status === "received"
                ? sum + num(p.amount)
                : p.status === "refunded"
                  ? sum - num(p.amount)
                  : sum,
            0,
          );
        return {
          project,
          client: clientsById[project.client_id],
          received,
          outstanding: Math.max(0, num(project.project_value) - received),
        };
      })
      .sort((a: any, b: any) =>
        String(a.project.deadline || "9999").localeCompare(
          String(b.project.deadline || "9999"),
        ),
      );
  }, [data, search, status, clientId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["projects-page"] });
    refreshWorkspaceData(queryClient);
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Every engagement, its value, deadline and collection status."
      >
        <div className="flex overflow-hidden rounded-lg border border-border bg-card">
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[12px]",
              view === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setView("board")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[12px]",
              view === "board"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Board
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, project: null })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New project
        </Button>
      </PageHeader>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[168px] bg-white text-[12.5px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUS_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {(PROJECT_STATUS as Record<string, any>)[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="h-9 w-[180px] bg-white text-[12.5px]">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(data?.clients || []).map((client: any) => (
              <SelectItem key={client.id} value={client.id}>
                <ClientRef client={client} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      {isLoading ? (
        <Skeleton className="h-[420px] rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={
            data?.projects?.length
              ? "No projects match these filters"
              : "No projects yet"
          }
          description={
            data?.projects?.length
              ? "Try a different status or client."
              : "Create a project to track scope, deadlines and money."
          }
          action={
            <Button
              size="sm"
              onClick={() => setDialog({ open: true, project: null })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add project
            </Button>
          }
        />
      ) : view === "list" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ project, client, received, outstanding }: any) => {
            const due = daysUntil(project.deadline);
            const overdue =
              due !== null &&
              due < 0 &&
              !["completed", "delivered", "cancelled"].includes(project.status);
            return (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="surface group flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      {project.project_code || "—"}
                    </p>
                    <h3 className="truncate font-heading text-[14px] font-semibold group-hover:text-primary">
                      {project.title}
                    </h3>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {client?.name || "No client"}
                    </p>
                  </div>
                  <StatusBadge status={project.status} map={PROJECT_STATUS} />
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progress</span>
                    <span className="tabular-nums">
                      {num(project.progress)}%
                    </span>
                  </div>
                  <Progress
                    value={num(project.progress)}
                    className="mt-1 h-1.5"
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-[11.5px]">
                  <div>
                    <p className="text-muted-foreground">Value</p>
                    <p className="font-semibold tabular-nums">
                      {inr(project.project_value)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Still to receive</p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        outstanding > 0 ? "text-amber-700" : "text-emerald-700",
                      )}
                    >
                      {inr(outstanding)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      overdue
                        ? "font-medium text-rose-600"
                        : "text-muted-foreground",
                    )}
                  >
                    <CalendarDays className="h-3 w-3" />{" "}
                    {project.deadline
                      ? fmtDate(project.deadline)
                      : "No deadline"}
                  </span>
                  <span className="text-muted-foreground">
                    {SERVICE_CATEGORIES.find(
                      (c) => c.value === project.service_category,
                    )?.label || "—"}
                  </span>
                </div>
                {received > 0 && (
                  <p className="mt-1 text-[10.5px] text-emerald-700">
                    Received {inr(received)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="scroll-slim flex gap-3 overflow-x-auto pb-3">
          {PROJECT_STATUS_ORDER.map((statusValue) => {
            const column = rows.filter(
              (row: any) => row.project.status === statusValue,
            );
            return (
              <div key={statusValue} className="w-[260px] shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-slate-700">
                    {(PROJECT_STATUS as Record<string, any>)[statusValue].label}
                  </p>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10.5px] text-slate-600">
                    {column.length}
                  </span>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-100/60 p-2">
                  {column.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                      Empty
                    </p>
                  ) : (
                    column.map(({ project, client, outstanding }: any) => (
                      <Link
                        key={project.id}
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="block rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40"
                      >
                        <p className="truncate text-[12.5px] font-medium">
                          {project.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {client?.name || "No client"}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="tabular-nums text-slate-600">
                            {inr(project.project_value)}
                          </span>
                          {outstanding > 0 && (
                            <span className="text-amber-700">
                              {inr(outstanding)} to receive
                            </span>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((prev: any) => ({ ...prev, open }))}
        project={dialog.project}
        defaultClientId={dialog.clientId}
        clients={data?.clients || []}
        onSaved={refresh}
      />
    </div>
  );
}
