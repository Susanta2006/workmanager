import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/notifications")({
  head: () => ({ meta: [{ title: "Notifications · WorkManager" }] }),
  component: NotificationsPage,
});

const TONE = {
  client: "bg-primary/10 text-primary",
  project: "bg-[hsl(var(--brand-violet)/0.12)] text-[hsl(var(--brand-violet))]",
  task: "bg-cyan-50 text-cyan-600",
  invoice: "bg-amber-50 text-amber-600",
  payment: "bg-emerald-50 text-emerald-600",
  team: "bg-rose-50 text-rose-600",
  system: "bg-slate-100 text-slate-600",
};

function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => ({
      items: await fetchAll("Notification", null),
    }),
  });

  const rows = useMemo(() => {
    const items = data?.items || [];
    return (filter === "unread" ? items.filter((n: any) => !n.read) : items).sort(
      (a: any, b: any) => String(b.created_date).localeCompare(String(a.created_date)),
    );
  }, [data, filter]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({
      queryKey: ["notifications", "unread-count"],
    });
  };

  const markRead = async (notification: any) => {
    try {
      if (!notification.read)
        await backend.entities.Notification.update(notification.id, {
          read: true,
        });
      refresh();
      if (notification.link) navigate({ to: notification.link });
    } catch (error: any) {
      toast.error(error?.message || "Could not update this notification.");
    }
  };

  const markAll = async () => {
    try {
      await backend.entities.Notification.updateMany(
        { read: false },
        { $set: { read: true } },
      );
      toast.success("All notifications marked as read");
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not mark notifications as read.");
    }
  };

  const remove = async (notification: any) => {
    try {
      await backend.entities.Notification.delete(notification.id);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this notification.");
    }
  };

  if (isLoading) return <Skeleton className="h-[400px] rounded-xl" />;
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not load notifications: {error.message}
      </p>
    );
  }

  const unreadCount = (data?.items || []).filter((n: any) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Deadline reminders, payment alerts and team updates in one place."
      >
        <div className="flex overflow-hidden rounded-lg border border-border bg-card">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1.5 text-[12px]",
              filter === "all"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={cn(
              "px-3 py-1.5 text-[12px]",
              filter === "unread"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={markAll}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
        </Button>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={
            filter === "unread"
              ? "You're all caught up"
              : "No notifications yet"
          }
          description="Reminders and workspace events will land here."
        />
      ) : (
        <div className="surface divide-y divide-border/70">
          {rows.map((notification: any) => (
            <div
              key={notification.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 transition",
                !notification.read && "bg-primary/[0.03]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  (TONE as Record<string, any>)[notification.type] || TONE.system,
                )}
              >
                <Bell className="h-3.5 w-3.5" />
              </span>
              <button
                onClick={() => markRead(notification)}
                className="min-w-0 flex-1 text-left"
              >
                <p
                  className={cn(
                    "truncate text-[13px]",
                    notification.read
                      ? "text-slate-600"
                      : "font-semibold text-foreground",
                  )}
                >
                  {notification.title}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {notification.message}
                </p>
                <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-slate-400">
                  {fmtDateTime(notification.created_date)}
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-slate-400 hover:text-rose-500"
                onClick={() => remove(notification)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
