import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { backend } from "@/api/backend";
import { logActivity } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { refreshWorkspaceData } from "@/lib/sync";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";

export default function DeleteProjectButton({ project }: any) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await backend.entities.Project.delete(project.id);
      await logActivity({
        user,
        action: "Project deleted",
        entityType: "Project",
        entityId: project.id,
        label: project.title,
      });
      toast.success("Project deleted");
      setOpen(false);
      // Leave the deleted project's page before refreshing, so nothing refetches it.
      navigate({ to: "/projects" });
      refreshWorkspaceData(queryClient);
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(value: any) => !value && setOpen(false)}
        title="Delete this project?"
        description={`This permanently deletes ${project.title || "the project"} and its milestones, tasks, documents, payments and expenses. Activity logs are retained. This cannot be undone.`}
        confirmLabel="Delete project"
        destructive
        busy={busy}
        onConfirm={remove}
      />
    </>
  );
}
