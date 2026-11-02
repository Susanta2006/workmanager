import { usePermissions } from "@/lib/permissions";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";
import ClientRef from "@/components/common/ClientRef";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  FileText,
  Flag,
  Pencil,
  Plus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, fetchOne, fetchUsers, logActivity } from "@/lib/db";
import { fetchWorkDivisions } from "@/lib/workforce";
import { useAuth } from "@/lib/AuthContext";
import {
  PRIORITY,
  PROJECT_STATUS,
  SERVICE_CATEGORIES,
  TASK_STATUS,
} from "@/lib/constants";
import { DOC_STATUS, docTypeLabel } from "@/lib/doc-types";
import { daysUntil, fmtDate, inr, num } from "@/lib/format";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ProjectDialog from "@/components/projects/ProjectDialog";
import TaskDialog from "@/components/tasks/TaskDialog";
import { TaskProgressControl } from "@/components/tasks/TaskProgressControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchClients } from "@/lib/clients";

export const Route = createFileRoute("/_authed/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project · WorkManager" }] }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [milestone, setMilestone] = useState({ title: "", due_date: "" });
  const [member, setMember] = useState("");
  const { canDelete, canAssignWork } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: async () => {
      const [project, milestones, tasks, documents, payments, users, clients, divisions] =
        await Promise.all([
          fetchOne("Project", projectId),
          fetchAll("Milestone", { project_id: projectId }),
          fetchAll("Task", { project_id: projectId }),
          fetchAll("Document", { project_id: projectId }),
          fetchAll("Payment", { project_id: projectId }),
          fetchUsers(),
          fetchClients(),
          fetchWorkDivisions(),
        ]);
      return {
        project,
        milestones,
        tasks,
        documents,
        payments,
        users,
        clients,
        divisions,
      };
    },
  });

  const summary = useMemo(() => {
    const payments = data?.payments || [];
    const received = payments.reduce(
      (sum: any, p: any) =>
        p.status === "received"
          ? sum + num(p.amount)
          : p.status === "refunded"
            ? sum - num(p.amount)
            : sum,
      0,
    );
    const value = num(data?.project?.project_value);
    return { received, value, outstanding: Math.max(0, value - received) };
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project-detail", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects-page"] });
  };

  const addMilestone = async (event: any) => {
    if (!canAssignWork) return;
    event.preventDefault();
    if (!milestone.title.trim()) return;
    try {
      await backend.entities.Milestone.create({
        project_id: projectId,
        title: milestone.title.trim(),
        due_date: milestone.due_date,
        status: "pending",
      });
      await logActivity({
        user,
        action: "Milestone added",
        entityType: "Project",
        entityId: projectId,
        label: milestone.title.trim(),
      });
      setMilestone({ title: "", due_date: "" });
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not add the milestone.");
    }
  };

  const toggleMilestone = async (item: any) => {
    if (!canAssignWork) return;
    try {
      await backend.entities.Milestone.update(item.id, {
        status: item.status === "completed" ? "pending" : "completed",
      });
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not update the milestone.");
    }
  };

  const addMember = async () => {
    if (!canAssignWork) return;
    if (!member || !data?.project) return;
    const team = Array.from(new Set([...(data.project.team || []), member]));
    try {
      await backend.entities.Project.update(projectId, { team });
      setMember("");
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not assign this member.");
    }
  };

  const removeMember = async (email: any) => {
    if (!canAssignWork) return;
    const team = (data?.project?.team || []).filter((m: any) => m !== email);
    await backend.entities.Project.update(projectId, { team });
    refresh();
  };

  const setTaskStatus = async (task: any, status: any) => {
    await backend.entities.Task.update(task.id, {
      status,
      progress: status === "completed" ? 100 : task.status === "completed" ? 0 : Number(task.progress || 0),
      completed_date:
        status === "completed" ? new Date().toISOString().slice(0, 10) : "",
    });
    refresh();
  };

  if (isLoading) return <Skeleton className="h-[500px] rounded-xl" />;
  if (!data?.project) {
    return (
      <EmptyState
        title="Project not found"
        description="This project may have been deleted or you don't have access to it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/projects">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to projects
            </Link>
          </Button>
        }
      />
    );
  }

  const project = data.project;
  const client = (data.clients || []).find((c: any) => c.id === project.client_id);
  const due = daysUntil(project.deadline);
  const overdue =
    due !== null &&
    due < 0 &&
    !["completed", "delivered", "cancelled"].includes(project.status);
  const completedMilestones = (data.milestones || []).filter(
    (m: any) => m.status === "completed",
  ).length;

  return (
    <div>
      <Link
        to="/projects"
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </Link>

      <div className="surface mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-[21px] font-bold leading-tight">
              {project.title}
            </h1>
            <StatusBadge status={project.status} map={PROJECT_STATUS} />
            <StatusBadge status={project.priority} map={PRIORITY} />
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {project.project_code || "—"} ·{" "}
            {client ? (
              <Link
                to="/clients/$clientId"
                params={{ clientId: client.id }}
                className="text-primary hover:underline"
              >
                <ClientRef client={client} />
              </Link>
            ) : (
              "No client linked"
            )}{" "}
            ·{" "}
            {SERVICE_CATEGORIES.find(
              (c) => c.value === project.service_category,
            )?.label || "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <span
              className={
                overdue ? "font-medium text-rose-600" : "text-muted-foreground"
              }
            >
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              {project.deadline
                ? `Deadline ${fmtDate(project.deadline)}`
                : "No deadline"}
              {overdue ? ` · ${Math.abs(due)} days overdue` : ""}
            </span>
            {project.start_date && (
              <span className="text-muted-foreground">
                Started {fmtDate(project.start_date)}
              </span>
            )}
            {project.completion_date && (
              <span className="text-emerald-700">
                Completed {fmtDate(project.completion_date)}
              </span>
            )}
          </div>
          <div className="mt-3 max-w-md">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Progress</span>
              <span className="tabular-nums">{num(project.progress)}%</span>
            </div>
            <Progress value={num(project.progress)} className="mt-1 h-1.5" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAssignWork && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {canDelete && <DeleteProjectButton project={project} />}
          {canAssignWork && (
            <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Task
            </Button>
          )}
          <Button asChild size="sm">
            <Link
              to="/documents/new"
              search={{ client: project.client_id, project: project.id }}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Document
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Project value"
          value={inr(summary.value)}
          hint={`Budget estimate ${inr(project.estimated_budget)}`}
          tone="blue"
        />
        <StatCard
          label="Received"
          value={inr(summary.received)}
          hint="Payments linked to this project"
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={inr(summary.outstanding)}
          hint="Value not yet collected"
          tone="amber"
        />
        <StatCard
          label="Milestones"
          value={`${completedMilestones}/${(data.milestones || []).length}`}
          hint="Completed"
          tone="violet"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="surface p-4">
            <h2 className="mb-3 font-heading text-[14px] font-semibold">
              Milestones
            </h2>
            {(data.milestones || []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                No milestones yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.milestones.map((item: any) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                  >
                    {canAssignWork && (
                      <Checkbox
                        checked={item.status === "completed"}
                        onCheckedChange={() => toggleMilestone(item)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[13px] ${item.status === "completed" ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {item.title}
                      </p>
                      {item.due_date && (
                        <p className="text-[11px] text-muted-foreground">
                          Due {fmtDate(item.due_date)}
                        </p>
                      )}
                    </div>
                    <Flag
                      className={`h-3.5 w-3.5 ${item.status === "completed" ? "text-emerald-500" : "text-slate-300"}`}
                    />
                  </li>
                ))}
              </ul>
            )}
            {canAssignWork && <form
              onSubmit={addMilestone}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <Input
                value={milestone.title}
                onChange={(e) =>
                  setMilestone((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Add a milestone…"
                className="h-9 bg-white text-[13px]"
              />
              <Input
                type="date"
                value={milestone.due_date}
                onChange={(e) =>
                  setMilestone((prev) => ({
                    ...prev,
                    due_date: e.target.value,
                  }))
                }
                className="h-9 w-full bg-white text-[13px] sm:w-[150px]"
              />
              <Button type="submit" size="sm" variant="outline">
                Add
              </Button>
            </form>}
          </section>

          <section className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-[14px] font-semibold">Tasks</h2>
              {canAssignWork && <Button
                variant="ghost"
                size="sm"
                onClick={() => setTaskOpen(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add task
              </Button>}
            </div>
            {(data.tasks || []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                No tasks linked to this project.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {data.tasks.map((task: any) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p
                        className={`truncate text-[13px] ${task.status === "completed" ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {task.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {task.due_date
                          ? `Due ${fmtDate(task.due_date)}`
                          : "No due date"}{" "}
                        · {task.assigned_to || "unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={task.status} map={TASK_STATUS} />
                      {canAssignWork && task.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-600"
                          onClick={() => setTaskStatus(task, "completed")}
                          title="Mark complete"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <TaskProgressControl
                        task={task}
                        editable={user?.role === "member" && task.assigned_to === user.email}
                        onSaved={refresh}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {project.description && (
            <section className="surface p-4">
              <h2 className="mb-2 font-heading text-[14px] font-semibold">
                Description
              </h2>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-700">
                {project.description}
              </p>
            </section>
          )}

          {(project.deliverables || project.internal_notes) && (
            <section className="surface grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <h2 className="mb-2 font-heading text-[14px] font-semibold">
                  Deliverables
                </h2>
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-700">
                  {project.deliverables || "—"}
                </p>
              </div>
              <div>
                <h2 className="mb-2 font-heading text-[14px] font-semibold">
                  Internal notes
                </h2>
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-700">
                  {project.internal_notes || "—"}
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="surface p-4">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-[14px] font-semibold">
              <Users className="h-3.5 w-3.5" /> Team
            </h2>
            {(project.team || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No team members assigned.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {project.team.map((email: any) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    {(data.users || []).find((u: any) => u.email === email)
                      ?.full_name || email}
                    {canAssignWork && <button
                      onClick={() => removeMember(email)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>}
                  </span>
                ))}
              </div>
            )}
            {canAssignWork && <div className="mt-3 flex gap-2">
              <Select value={member} onValueChange={setMember}>
                <SelectTrigger className="h-8 flex-1 bg-white text-[12px]">
                  <SelectValue placeholder="Assign member" />
                </SelectTrigger>
                <SelectContent>
                  {(data.users || []).filter((u: any) => (
                    u.is_available
                    && u.account_status === "approved"
                    && u.team_status === "active"
                    && (user?.role !== "leader" || u.role === "member")
                  )).map((u: any) => (
                    <SelectItem key={u.id} value={u.email}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={addMember}
                disabled={!member}
              >
                Add
              </Button>
            </div>}
          </section>

          <section className="surface p-4">
            <h2 className="mb-3 font-heading text-[14px] font-semibold">
              Documents
            </h2>
            {(data.documents || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No documents linked.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {data.documents.map((doc: any) => (
                  <li key={doc.id}>
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: doc.id }}
                      className="flex items-center justify-between gap-2 py-2 hover:text-primary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium">
                          {doc.doc_number}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {docTypeLabel(doc.doc_type)}
                        </span>
                      </span>
                      <StatusBadge status={doc.status} map={DOC_STATUS} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface p-4">
            <h2 className="mb-3 font-heading text-[14px] font-semibold">
              Payments
            </h2>
            {(data.payments || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No payments recorded.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {data.payments.map((payment: any) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between py-2 text-[12px]"
                  >
                    <span className="text-muted-foreground">
                      {fmtDate(payment.payment_date)}
                    </span>
                    <span
                      className={`font-medium tabular-nums ${payment.status === "refunded" ? "text-rose-600" : "text-emerald-700"}`}
                    >
                      {inr(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {canAssignWork && <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        clients={data.clients || []}
        onSaved={refresh}
      />}
      {canAssignWork && <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaults={{ project_id: project.id, client_id: project.client_id }}
        clients={data.clients || []}
        projects={[project]}
        users={data.users || []}
        divisions={data.divisions || []}
        onSaved={refresh}
      />}
    </div>
  );
}
