import { refreshWorkspaceData } from "@/lib/sync";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  List,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { fetchAll, fetchUsers } from "@/lib/db";
import { fetchWorkDivisions } from "@/lib/workforce";
import { PRIORITY, TASK_STATUS_OPTIONS } from "@/lib/constants";
import { daysUntil, fmtDate } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import TaskDialog from "@/components/tasks/TaskDialog";
import { TaskProgressControl } from "@/components/tasks/TaskProgressControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authed/tasks")({
  validateSearch: validateNewRecordSearch,
  head: () => ({
    meta: [{ title: "Tasks & Calendar · WorkManager" }],
  }),
  component: TasksPage,
});

function TasksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canAssignWork } = usePermissions();
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [assignee, setAssignee] = useState("all");
  const prefill = Route.useSearch();
  const [dialog, setDialog] = useState<any>(() => ({
    open: prefill.new === true,
    task: null as any,
    defaults: prefill.client ? { client_id: prefill.client } : undefined,
  }));
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tasks-page"],
    queryFn: async () => {
      const [tasks, projects, clients, users, divisions] = await Promise.all([
        fetchAll("Task", null),
        fetchAll("Project", null),
        fetchClients(),
        fetchUsers(),
        fetchWorkDivisions(),
      ]);
      return { tasks, projects, clients, users, divisions };
    },
  });

  const tasks = useMemo(() => {
    return (data?.tasks || [])
      .filter((task: any) => {
        if (
          status === "open" &&
          ["completed", "cancelled"].includes(task.status)
        )
          return false;
        if (status !== "all" && status !== "open" && task.status !== status)
          return false;
        if (assignee !== "all" && task.assigned_to !== assignee) return false;
        if (search) {
          const haystack =
            `${task.title} ${task.description} ${task.notes}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a: any, b: any) =>
        String(a.due_date || "9999").localeCompare(
          String(b.due_date || "9999"),
        ),
      );
  }, [data, search, status, assignee]);

  const projectName = (id: any) =>
    (data?.projects || []).find((p: any) => p.id === id)?.title;
  const clientName = (id: any) =>
    (data?.clients || []).find((c: any) => c.id === id)?.name;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks-page"] });
    refreshWorkspaceData(queryClient);
  };

  // Optimistic: the checkbox updates instantly, and rolls back if the save fails.
  const statusMutation = useMutation({
    mutationFn: ({ task, nextStatus }: { task: any; nextStatus: string }) =>
      backend.entities.Task.update(task.id, {
        status: nextStatus,
        progress: nextStatus === "completed" ? 100 : task.status === "completed" ? 0 : Number(task.progress || 0),
        completed_date:
          nextStatus === "completed" ? new Date().toISOString().slice(0, 10) : "",
      }),
    onMutate: async ({ task, nextStatus }: { task: any; nextStatus: string }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks-page"] });
      const previous = queryClient.getQueryData(["tasks-page"]);
      const today = new Date().toISOString().slice(0, 10);
      queryClient.setQueryData(["tasks-page"], (old: any) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((t: any) =>
                t.id === task.id
                  ? {
                      ...t,
                      status: nextStatus,
                      progress: nextStatus === "completed" ? 100 : task.status === "completed" ? 0 : Number(task.progress || 0),
                      completed_date: nextStatus === "completed" ? today : "",
                    }
                  : t,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["tasks-page"], context.previous);
      toast.error(error?.message || "Could not update the task. Your change was reverted.");
    },
    onSettled: refresh,
  });

  const setTaskStatus = (task: any, nextStatus: string) =>
    statusMutation.mutate({ task, nextStatus });

  const pullToRefresh = usePullToRefresh(() => refetch());

  const monthTasks = useMemo(() => {
    const map: Record<string, any> = {};
    tasks.forEach((task: any) => {
      const key = String(task.due_date || "").slice(0, 10);
      if (!key) return;
      (map as Record<string, any>)[key] = (map as Record<string, any>)[key] || [];
      (map as Record<string, any>)[key].push(task);
    });
    return map;
  }, [tasks]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list = Array.from({ length: offset }, (): number | null => null);
    for (let day = 1; day <= daysInMonth; day += 1) list.push(day);
    return list;
  }, [cursor]);

  const monthLabelText = new Date(
    cursor.year,
    cursor.month,
    1,
  ).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const pad = (n: any) => String(n).padStart(2, "0");

  return (
    <div {...pullToRefresh.bind} className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pullToRefresh.refreshing ? 40 : pullToRefresh.pull }}
      >
        <RefreshCw
          className={cn(
            "mt-2 h-5 w-5 text-primary",
            pullToRefresh.refreshing && "animate-spin",
          )}
          style={{ transform: `rotate(${pullToRefresh.pull * 3}deg)` }}
        />
      </div>
      <PageHeader
        title="Tasks & calendar"
        description="Assign work, track deadlines and see the month at a glance."
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
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[12px]",
              view === "calendar"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendar
          </button>
        </div>
        {canAssignWork && (
          <Button size="sm" onClick={() => setDialog({ open: true, task: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New task
          </Button>
        )}
      </PageHeader>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open tasks</SelectItem>
            <SelectItem value="all">All tasks</SelectItem>
            {TASK_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="h-9 w-[170px] bg-white text-[12.5px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {(data?.users || []).map((user: any) => (
              <SelectItem key={user.id} value={user.email}>
                {user.full_name || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      {isLoading ? (
        <Skeleton className="h-[420px] rounded-xl" />
      ) : view === "list" ? (
        tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks here"
            description="Create a task and link it to a project or client."
            action={canAssignWork ? (
              <Button
                size="sm"
                onClick={() => setDialog({ open: true, task: null })}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add task
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="surface divide-y divide-border/70">
            {tasks.map((task: any) => {
              const due = daysUntil(task.due_date);
              const overdue =
                due !== null &&
                due < 0 &&
                !["completed", "cancelled"].includes(task.status);
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {canAssignWork ? (
                      <button
                        onClick={() =>
                          setTaskStatus(
                            task,
                            task.status === "completed" ? "todo" : "completed",
                          )
                        }
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                          task.status === "completed"
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 hover:border-emerald-500",
                        )}
                        title="Toggle complete"
                      >
                        {task.status === "completed" && <Check className="h-3 w-3" />}
                      </button>
                    ) : (
                      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-primary/40" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      {canAssignWork ? (
                        <button
                          onClick={() => setDialog({ open: true, task })}
                          className="block truncate text-left text-[13px] font-medium hover:text-primary"
                        >
                          {task.title}
                        </button>
                      ) : (
                        <p className="truncate text-[13px] font-medium">{task.title}</p>
                      )}
                      <p className="truncate text-[11px] text-muted-foreground">
                        {task.task_kind === "work_package" ? "Work package · " : ""}
                        {task.due_date ? (
                          <span
                            className={
                              overdue ? "font-medium text-rose-600" : ""
                            }
                          >
                            {overdue
                              ? `${Math.abs(due)} days overdue · `
                              : "Due "}
                            {fmtDate(task.due_date)}
                          </span>
                        ) : (
                          "No due date"
                        )}
                        {task.assigned_to ? ` · ${task.assigned_to}` : ""}
                        {task.project_id
                          ? ` · ${projectName(task.project_id) || "project"}`
                          : task.client_id
                            ? ` · ${clientName(task.client_id) || "client"}`
                            : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-8 sm:pl-0">
                    <StatusBadge status={task.priority} map={PRIORITY} />
                    <Select
                      value={task.status}
                      onValueChange={(value) => setTaskStatus(task, value)}
                      disabled={!canAssignWork}
                    >
                      <SelectTrigger className="h-7 w-[124px] bg-white text-[11.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TaskProgressControl
                      task={task}
                      editable={user?.role === "member" && task.assigned_to === user.email}
                      onSaved={refresh}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-[15px] font-semibold">
              {monthLabelText}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setCursor(({ year, month }) =>
                    month === 0
                      ? { year: year - 1, month: 11 }
                      : { year, month: month - 1 },
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11.5px]"
                onClick={() => {
                  const now = new Date();
                  setCursor({ year: now.getFullYear(), month: now.getMonth() });
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setCursor(({ year, month }) =>
                    month === 11
                      ? { year: year + 1, month: 0 }
                      : { year, month: month + 1 },
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (!day)
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[86px] rounded-lg bg-slate-50/50"
                  />
                );
              const key = `${cursor.year}-${pad(cursor.month + 1)}-${pad(day)}`;
              const dayTasks = (monthTasks as Record<string, any>)[key] || [];
              const isToday =
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
                }) === key;
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[86px] rounded-lg border p-1.5",
                    isToday
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-white",
                  )}
                >
                  <p
                    className={cn(
                      "mb-1 text-[10.5px] font-semibold",
                      isToday ? "text-primary" : "text-slate-500",
                    )}
                  >
                    {day}
                  </p>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 2).map((task: any) => (
                      <button
                        key={task.id}
                        onClick={() => canAssignWork && setDialog({ open: true, task })}
                        disabled={!canAssignWork}
                        className={cn(
                          "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight",
                          task.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 line-through"
                            : "bg-primary/10 text-primary hover:bg-primary/20",
                        )}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 2 && (
                      <p className="px-1 text-[9.5px] text-muted-foreground">
                        +{dayTasks.length - 2} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TaskDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((prev: any) => ({ ...prev, open }))}
        task={dialog.task}
        defaults={dialog.defaults}
        clients={data?.clients || []}
        projects={data?.projects || []}
        users={data?.users || []}
        divisions={data?.divisions || []}
        onSaved={refresh}
      />
    </div>
  );
}
