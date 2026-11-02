import { useEffect, useState } from "react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import { logActivity, nextSequence, pushNotification } from "@/lib/db";
import {
  PRIORITY_OPTIONS,
  PROJECT_STATUS,
  SERVICE_CATEGORIES,
} from "@/lib/constants";
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
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/common/FormFields";
import { clientOptions } from "@/lib/clients";

const emptyForm = {
  title: "",
  client_id: "",
  service_category: "web_development",
  status: "lead",
  priority: "medium",
  start_date: "",
  deadline: "",
  completion_date: "",
  estimated_budget: "",
  project_value: "",
  progress: 0,
  deliverables: "",
  internal_notes: "",
  description: "",
};

export default function ProjectDialog({
  open,
  onOpenChange,
  project,
  clients = [],
  defaultClientId,
  onSaved,
}: any) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (project) {
      setForm({ ...emptyForm, ...project });
    } else {
      setForm({ ...emptyForm, client_id: defaultClientId || "" });
    }
  }, [open, project, defaultClientId]);

  const set = (key: any) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: any) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Project title is required.");
      return;
    }
    if (!form.client_id) {
      setError("Select the client this project belongs to.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        estimated_budget: Number(form.estimated_budget || 0),
        project_value: Number(form.project_value || 0),
        progress: Number(form.progress || 0),
      };
      let saved;
      if (project?.id) {
        saved = await backend.entities.Project.update(project.id, payload);
        await logActivity({
          user,
          action: "Project updated",
          entityType: "Project",
          entityId: project.id,
          label: saved.title,
        });
        if (project.status !== saved.status) {
          await logActivity({
            user,
            action: "Project status changed",
            entityType: "Project",
            entityId: saved.id,
            label: saved.title,
            details: `${project.status} → ${saved.status}`,
          });
          await pushNotification({
            title: "Project status changed",
            message: `${saved.title} moved to ${(PROJECT_STATUS as Record<string, any>)[saved.status]?.label || saved.status}.`,
            type: "project",
            link: `/projects/${saved.id}`,
            relatedRecordId: saved.id,
          });
        }
        toast.success("Project updated");
      } else {
        const project_code = await nextSequence(
          "Project",
          "project_code",
          "PRJ",
        );
        saved = await backend.entities.Project.create({
          ...payload,
          project_code,
        });
        await logActivity({
          user,
          action: "Project created",
          entityType: "Project",
          entityId: saved.id,
          label: saved.title,
        });
        await pushNotification({
          title: "New project created",
          message: `${saved.title} was added to the workspace.`,
          type: "project",
          link: `/projects/${saved.id}`,
          relatedRecordId: saved.id,
        });
        toast.success("Project created");
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Could not save this project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[680px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {project ? "Edit project" : "New project"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {project
              ? `Update the engagement for ${project.title}.`
              : "Create an engagement and track its value and deadlines."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Project title"
              value={form.title}
              onChange={set("title")}
              required
              className="sm:col-span-2"
            />
            <SelectField
              label="Client"
              value={form.client_id}
              onChange={set("client_id")}
              options={clientOptions(clients)}
              placeholder="Select a client"
            />
            <SelectField
              label="Service category"
              value={form.service_category}
              onChange={set("service_category")}
              options={SERVICE_CATEGORIES}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={set("status")}
              options={Object.entries(PROJECT_STATUS).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
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
              label="Deadline"
              type="date"
              value={form.deadline}
              onChange={set("deadline")}
            />
            <NumberField
              label="Estimated budget (₹)"
              value={form.estimated_budget}
              onChange={set("estimated_budget")}
            />
            <NumberField
              label="Agreed project value (₹)"
              value={form.project_value}
              onChange={set("project_value")}
            />
            <NumberField
              label="Progress (%)"
              value={form.progress}
              onChange={set("progress")}
            />
            <TextField
              label="Completion date"
              type="date"
              value={form.completion_date}
              onChange={set("completion_date")}
            />
            <TextAreaField
              label="Description"
              value={form.description}
              onChange={set("description")}
              rows={2}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Deliverables"
              value={form.deliverables}
              onChange={set("deliverables")}
              rows={2}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Internal notes"
              value={form.internal_notes}
              onChange={set("internal_notes")}
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
              {saving ? "Saving…" : project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
