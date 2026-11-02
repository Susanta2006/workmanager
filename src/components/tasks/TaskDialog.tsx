import { useEffect, useState } from "react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/db";
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/common/FormFields";
import { clientOptions } from "@/lib/clients";

const emptyForm = {
  title: "",
  description: "",
  client_id: "",
  project_id: "",
  assigned_to: "",
  start_date: "",
  due_date: "",
  priority: "medium",
  status: "todo",
  progress: 0,
  task_kind: "task",
  division_id: "",
  notes: "",
};

// A stable empty object: a new one on every render would re-run the form reset on every keystroke.
const NO_DEFAULTS: Record<string, unknown> = {};

export default function TaskDialog({
  open,
  onOpenChange,
  task,
  clients = [],
  projects = [],
  users = [],
  divisions = [],
  defaults = NO_DEFAULTS,
  onSaved,
}: any) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (task) setForm({ ...emptyForm, ...task });
    else setForm({ ...emptyForm, ...defaults });
  }, [open, task, defaults]);

  const set = (key: any) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const projectOptions = form.client_id
    ? projects.filter((p: any) => p.client_id === form.client_id)
    : projects;

  const submit = async (event: any) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Task title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        progress: form.status === "completed" ? 100 : Number(form.progress || 0),
        completed_date:
          form.status === "completed"
            ? task?.completed_date || new Date().toISOString().slice(0, 10)
            : "",
      };
      let saved;
      if (task?.id) {
        saved = await backend.entities.Task.update(task.id, payload);
        await logActivity({
          user,
          action:
            task.status !== saved.status
              ? "Task status changed"
              : "Task updated",
          entityType: "Task",
          entityId: task.id,
          label: saved.title,
          details:
            task.status !== saved.status
              ? `${task.status} → ${saved.status}`
              : "",
        });
        toast.success("Task updated");
      } else {
        saved = await backend.entities.Task.create(payload);
        await logActivity({
          user,
          action: "Task created",
          entityType: "Task",
          entityId: saved.id,
          label: saved.title,
        });
        toast.success("Task created");
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Could not save this task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {task ? "Edit task" : "New task"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Link the task to a client or project and set a due date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Task title"
              value={form.title}
              onChange={set("title")}
              required
              className="sm:col-span-2"
            />
            <SelectField
              label="Client"
              value={form.client_id}
              onChange={(value: any) =>
                setForm((prev) => ({
                  ...prev,
                  client_id: value,
                  project_id: "",
                }))
              }
              options={clientOptions(clients)}
              placeholder="Optional"
            />
            <SelectField
              label="Project"
              value={form.project_id}
              onChange={set("project_id")}
              options={projectOptions.map((p: any) => ({
                value: p.id,
                label: p.title,
              }))}
              placeholder="Optional"
            />
            <SelectField
              label="Assigned to"
              value={form.assigned_to}
              onChange={set("assigned_to")}
              options={users.filter((u: any) => (
                (u.account_status === "approved" && u.team_status === "active" && u.is_available)
                || u.email === form.assigned_to
              )).filter((u: any) => (
                !form.division_id
                || (u.division_ids || []).includes(form.division_id)
                || u.email === form.assigned_to
              )).map((u: any) => ({
                value: u.email,
                label: `${u.full_name || u.email}${u.is_available ? "" : " (unavailable)"}`,
              }))}
              placeholder="Unassigned"
            />
            <SelectField
              label="Work type"
              value={form.task_kind || "task"}
              onChange={set("task_kind")}
              options={[
                { value: "task", label: "Task" },
                { value: "work_package", label: "Work package" },
              ]}
            />
            <SelectField
              label="Division"
              value={form.division_id || ""}
              onChange={(divisionId: any) => {
                const assignee = users.find((item: any) => item.email === form.assigned_to);
                setForm((prev) => ({
                  ...prev,
                  division_id: divisionId,
                  assigned_to:
                    !divisionId || (assignee?.division_ids || []).includes(divisionId)
                      ? prev.assigned_to
                      : "",
                }));
              }}
              options={divisions.map((division: any) => ({ value: division.id, label: division.name }))}
              placeholder="No division"
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={set("status")}
              options={TASK_STATUS_OPTIONS}
            />
            <SelectField
              label="Priority"
              value={form.priority}
              onChange={set("priority")}
              options={PRIORITY_OPTIONS}
            />
            <TextField
              label="Start date"
              type="date"
              value={form.start_date}
              onChange={set("start_date")}
            />
            <TextField
              label="Due date"
              type="date"
              value={form.due_date}
              onChange={set("due_date")}
            />
            <TextAreaField
              label="Description"
              value={form.description}
              onChange={set("description")}
              rows={2}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Notes"
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              className="sm:col-span-2"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : task ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
