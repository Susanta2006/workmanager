import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { backend } from "@/api/backend";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function TaskProgressControl({
  task,
  editable,
  onSaved,
}: {
  task: any;
  editable: boolean;
  onSaved: () => void;
}) {
  const savedProgress = Math.min(100, Math.max(0, Number(task.progress) || 0));
  const [progress, setProgress] = useState(savedProgress);
  const [saving, setSaving] = useState(false);

  useEffect(() => setProgress(savedProgress), [savedProgress]);

  const save = async (complete = false) => {
    setSaving(true);
    try {
      await backend.entities.Task.update(task.id, {
        progress: complete ? 100 : progress,
        progress_updated_at: new Date().toISOString(),
        ...(complete
          ? {
              status: "completed",
              completed_date: new Date().toISOString().slice(0, 10),
            }
          : {}),
      });
      toast.success(complete ? "Task marked done" : "Progress updated");
      onSaved();
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not update task progress.");
      setProgress(savedProgress);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-[150px] space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-semibold tabular-nums">{progress}%</span>
      </div>
      {editable ? (
        <>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={progress}
            onChange={(event) => setProgress(Number(event.target.value))}
            disabled={saving || task.status === "completed"}
            aria-label={`Progress for ${task.title}`}
            className="h-2 w-full cursor-pointer accent-primary"
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => save()}
              disabled={saving || progress === savedProgress || task.status === "completed"}
            >
              Save progress
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => save(true)}
              disabled={saving || progress !== 100 || task.status === "completed"}
            >
              <Check className="mr-1 h-3 w-3" /> Done
            </Button>
          </div>
        </>
      ) : (
        <Progress value={savedProgress} className="h-1.5" />
      )}
    </div>
  );
}
