import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Power, PowerOff } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import PageHeader from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/permissions";
import {
  ACTIVE_MISSION_STATUSES,
  bootstrapVirtualTeam,
  fetchAuditLogs,
  fetchFinanceSummary,
  fetchMembers,
  fetchMissionDetail,
  fetchMissions,
  fetchTodayUsage,
  reviewMission,
  saveSettings,
  setMemberActive,
  useOperatingMode,
  type Member,
  type Mission,
  type Settings,
} from "@/lib/virtual-team";
import ChatPanel from "./ChatPanel";
import PromptLibrary from "./PromptLibrary";
import { Avatar, downloadText, formatMoney, formatTime, OperatingModeSwitch, StatusBadge } from "./shared";

export default function VirtualTeamPage() {
  const { canManageSettings } = usePermissions();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  // Creates the employees and the team chat the first time this page opens (idempotent).
  useEffect(() => {
    let active = true;
    bootstrapVirtualTeam()
      .then(() => active && setReady(true))
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Virtual Team could not open.");
      })
      .finally(() => {
        if (active) queryClient.invalidateQueries({ queryKey: ["virtual-team"] });
      });
    return () => {
      active = false;
    };
  }, [queryClient]);

  return (
    <div>
      <PageHeader
        title="Virtual Team"
        description="Manager AI and your AI employees. Give instructions in the team chat, follow missions, and keep the Prompt Library."
      />

      <OperatingModeSwitch />

      <Tabs defaultValue="chat">
        <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="chat" className="rounded-full border border-border data-[state=active]:bg-blue-50">Chat</TabsTrigger>
          <TabsTrigger value="missions" className="rounded-full border border-border data-[state=active]:bg-blue-50">Missions</TabsTrigger>
          <TabsTrigger value="prompts" className="rounded-full border border-border data-[state=active]:bg-blue-50">Prompt Library</TabsTrigger>
          <TabsTrigger value="analyst" className="rounded-full border border-border data-[state=active]:bg-blue-50">Business Analyst</TabsTrigger>
          {canManageSettings && (
            <TabsTrigger value="settings" className="rounded-full border border-border data-[state=active]:bg-blue-50">Settings & audit</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="chat">
          {ready ? <ChatWorkspace /> : <p className="text-[12.5px] text-muted-foreground">Opening Virtual Team…</p>}
        </TabsContent>
        <TabsContent value="missions">
          <MissionsPanel />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptLibrary />
        </TabsContent>
        <TabsContent value="analyst">
          <AnalystPanel />
        </TabsContent>
        {canManageSettings && (
          <TabsContent value="settings">
            <SettingsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ChatWorkspace() {
  const [chatWith, setChatWith] = useState<string | null>(null);
  const members = useQuery({ queryKey: ["virtual-team", "members"], queryFn: fetchMembers });
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Directory members={members.data ?? []} chatWith={chatWith} onSelect={setChatWith} />
      <ChatPanel members={members.data ?? []} chatWith={chatWith} onChatWithChange={setChatWith} />
    </div>
  );
}

function Directory({
  members,
  chatWith,
  onSelect,
}: {
  members: Member[];
  chatWith: string | null;
  onSelect: (memberId: string | null) => void;
}) {
  const { canManageTeam } = usePermissions();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = members.find((member) => member.is_manager);
  const employees = members.filter((member) => !member.is_manager);

  async function toggle() {
    if (!pending) return;
    setBusy(true);
    try {
      await setMemberActive(pending.id, !pending.active);
      toast.success(pending.active ? `${pending.display_name} is deactivated.` : `${pending.display_name} is active again.`);
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["virtual-team", "members"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="space-y-2">
      <p className="px-1 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Team</p>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left ${
          chatWith === null ? "border-blue-300 bg-blue-50/60" : "border-border bg-card hover:bg-muted/40"
        }`}
      >
        <Avatar name="Manager AI" seed="manager" size="sm" />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">Team chat</span>
          <span className="block text-[11.5px] text-muted-foreground">Manager AI and the team</span>
        </span>
      </button>

      {employees.map((employee) => (
        <div
          key={employee.id}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
            chatWith === employee.id ? "border-blue-300 bg-blue-50/60" : "border-border bg-card"
          } ${employee.active ? "" : "opacity-60"}`}
        >
          <button type="button" onClick={() => onSelect(employee.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Avatar name={employee.display_name} seed={employee.member_key} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">{employee.display_name}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {employee.job_title}
                {!employee.active ? " · inactive" : ""}
              </span>
            </span>
          </button>
          {canManageTeam && (
            <button
              type="button"
              onClick={() => setPending(employee)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={employee.active ? `Deactivate ${employee.display_name}` : `Activate ${employee.display_name}`}
            >
              {employee.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      ))}

      {manager && (
        <p className="px-1 pt-2 text-[11.5px] text-muted-foreground">
          Mention an employee with @name in the team chat to ask them directly.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open: boolean) => !open && setPending(null)}
        title={pending?.active ? `Deactivate ${pending?.display_name}?` : `Activate ${pending?.display_name}?`}
        description={
          pending?.active
            ? "They stay in the directory and their chat history and past work are kept, but they will not receive new work until reactivated."
            : "They will be able to receive new work again."
        }
        confirmLabel={pending?.active ? "Deactivate" : "Activate"}
        busy={busy}
        onConfirm={toggle}
      />
    </aside>
  );
}

function MissionsPanel() {
  const { canManageSettings } = usePermissions();
  const queryClient = useQueryClient();
  const missions = useQuery({ queryKey: ["virtual-team", "missions"], queryFn: fetchMissions, refetchInterval: 8000 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Mission | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(mission: Mission, action: "approve" | "pause" | "resume" | "cancel") {
    setBusy(true);
    try {
      await reviewMission(mission.id, action);
      toast.success(
        action === "approve" ? "Mission approved." : action === "pause" ? "Mission paused." : action === "resume" ? "Mission resumed." : "Mission cancelled.",
      );
      setCancelTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["virtual-team"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The mission could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  const list = missions.data ?? [];
  if (missions.isLoading) return <p className="text-[12.5px] text-muted-foreground">Loading missions…</p>;
  if (list.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-[12.5px] text-muted-foreground">
        No missions yet. Ask Manager AI for work in the team chat, and it will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((mission) => {
        const open = expanded === mission.id;
        const active = ACTIVE_MISSION_STATUSES.includes(mission.status);
        return (
          <article key={mission.id} className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-heading text-[14px] font-semibold text-foreground">{mission.title}</h3>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {formatTime(mission.created_at)} · {mission.origin === "scheduled" ? "Scheduled" : "Started by you"} · {mission.tokens_used} of {mission.token_budget} tokens
                </p>
              </div>
              <StatusBadge status={mission.status} />
            </header>

            {mission.error && <p className="mt-2 text-[12px] text-rose-700">{mission.error}</p>}
            {mission.summary && (
              <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
                {open ? mission.summary : mission.summary.slice(0, 280) + (mission.summary.length > 280 ? "…" : "")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canManageSettings && mission.status === "awaiting_approval" && (
                <Button size="sm" onClick={() => act(mission, "approve")} disabled={busy}>Approve</Button>
              )}
              {canManageSettings && (mission.status === "queued" || mission.status === "running") && (
                <Button size="sm" variant="outline" onClick={() => act(mission, "pause")} disabled={busy}>Pause</Button>
              )}
              {canManageSettings && mission.status === "paused" && (
                <Button size="sm" variant="outline" onClick={() => act(mission, "resume")} disabled={busy}>Resume</Button>
              )}
              {canManageSettings && active && (
                <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => setCancelTarget(mission)} disabled={busy}>
                  Cancel
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : mission.id)}>
                {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                {open ? "Hide details" : "Details and files"}
              </Button>
            </div>

            {open && <MissionDetail missionId={mission.id} />}
          </article>
        );
      })}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open: boolean) => !open && setCancelTarget(null)}
        title="Cancel this mission?"
        description="Queued and running tasks stop. Work already saved stays in the record. This cannot be undone."
        confirmLabel="Cancel mission"
        destructive
        busy={busy}
        onConfirm={() => cancelTarget && act(cancelTarget, "cancel")}
      />
    </div>
  );
}

function MissionDetail({ missionId }: { missionId: string }) {
  const detail = useQuery({
    queryKey: ["virtual-team", "mission-detail", missionId],
    queryFn: () => fetchMissionDetail(missionId),
  });
  const members = useQuery({ queryKey: ["virtual-team", "members"], queryFn: fetchMembers });
  const nameOf = (id: string | null) => members.data?.find((member) => member.id === id)?.display_name ?? "Employee";

  if (detail.isLoading) return <p className="mt-3 text-[12px] text-muted-foreground">Loading details…</p>;
  if (detail.error) return <p className="mt-3 text-[12px] text-rose-700">The details could not be loaded.</p>;
  const tasks = detail.data?.tasks ?? [];
  const deliverables = detail.data?.deliverables ?? [];

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-3">
      <section className="space-y-1.5">
        <h4 className="text-[12.5px] font-semibold text-foreground">Tasks</h4>
        {tasks.map((task) => (
          <div key={task.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12px]">
            <span className="min-w-0">
              <span className="font-medium text-foreground">{task.position}. {nameOf(task.member_id)}</span>
              <span className="block text-muted-foreground">{task.instruction}</span>
              {task.last_error && <span className="block text-amber-700">{task.last_error}</span>}
            </span>
            <StatusBadge status={task.status} />
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        <h4 className="text-[12.5px] font-semibold text-foreground">Deliverables</h4>
        {deliverables.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No deliverables yet.</p>
        ) : (
          deliverables.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12px]">
              <span className="min-w-0 truncate font-medium text-foreground">{item.title}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadText(`${item.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "deliverable"}.md`, item.content, "text/markdown;charset=utf-8")}
              >
                Download .md
              </Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function AnalystPanel() {
  const summary = useQuery({ queryKey: ["virtual-team", "finance"], queryFn: fetchFinanceSummary, staleTime: 60_000 });
  if (summary.isLoading) return <p className="text-[12.5px] text-muted-foreground">Calculating from your records…</p>;
  if (summary.error) {
    return <p className="text-[12.5px] text-rose-700">The figures could not be calculated. {summary.error instanceof Error ? summary.error.message : ""}</p>;
  }
  const s = summary.data;
  if (!s) return null;

  const cards: { label: string; value: string; hint?: string }[] = [
    { label: "Received (all time)", value: formatMoney(s.received_total), hint: `${s.payment_count} payment records` },
    { label: "Received, last 30 days", value: formatMoney(s.received_last_30_days) },
    { label: "Promised, not yet received", value: formatMoney(s.pending_payments_total), hint: `${s.pending_payment_count} pending` },
    { label: "Outstanding invoices", value: formatMoney(s.outstanding_invoices_total), hint: `${s.outstanding_invoice_count} unpaid` },
    { label: "Expenses (all time)", value: formatMoney(s.expenses_total), hint: `${formatMoney(s.expenses_pending_total)} still pending` },
    { label: "Expenses, last 30 days", value: formatMoney(s.expenses_last_30_days) },
    { label: "Net position", value: formatMoney(s.net_position), hint: "Received less refunds less expenses" },
    { label: "Open tasks", value: String(s.open_task_count), hint: `${s.overdue_task_count} overdue` },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Calculated from your records as of {s.as_of} (India time). Figures are not estimated. Pending expenses are included in expenses, as in Reports.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11.5px] text-muted-foreground">{card.label}</p>
            <p className="mt-1 font-heading text-[18px] font-semibold text-foreground">{card.value}</p>
            {card.hint && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{card.hint}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-[13px] font-semibold text-foreground">Overdue tasks</h3>
        {s.overdue_tasks.length === 0 ? (
          <p className="mt-1 text-[12px] text-muted-foreground">No overdue tasks.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[12.5px]">
            {s.overdue_tasks.map((task, index) => (
              <li key={`${task.title}-${index}`} className="flex flex-wrap justify-between gap-2">
                <span className="min-w-0 truncate text-foreground">{task.title}</span>
                <span className="text-rose-700">due {task.due_date} · {task.progress}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SettingsPanel() {
  const settings = useOperatingMode();
  const usage = useQuery({ queryKey: ["virtual-team", "usage"], queryFn: fetchTodayUsage, refetchInterval: 30_000 });
  const audit = useQuery({ queryKey: ["virtual-team", "audit"], queryFn: fetchAuditLogs });
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Omit<Settings, "operating_mode"> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data && !form) {
      const { operating_mode: _mode, ...rest } = settings.data;
      setForm(rest);
    }
  }, [settings.data, form]);

  if (!form) return <p className="text-[12.5px] text-muted-foreground">Loading settings…</p>;

  const numberField = (key: keyof typeof form, min: number, max: number) => (
    <Input
      type="number"
      min={min}
      max={max}
      value={String(form[key])}
      onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
      aria-label={String(key)}
    />
  );

  const valid =
    form.max_concurrent_missions >= 1 && form.max_concurrent_missions <= 10 &&
    form.mission_token_budget >= 500 && form.mission_token_budget <= 200000 &&
    form.daily_token_limit >= 1000 && form.daily_token_limit <= 5000000;

  async function save() {
    if (!form || !valid) return;
    setSaving(true);
    try {
      await saveSettings(form);
      toast.success("Settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["virtual-team", "settings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading text-[14px] font-semibold text-foreground">Limits and background work</h3>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="vt-background" className="text-[12.5px]">Background work (scheduled briefings and queued tasks)</Label>
          <Switch id="vt-background" checked={form.background_enabled} onCheckedChange={(value) => setForm({ ...form, background_enabled: value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[12px]">Maximum running missions (1–10)</Label>
            {numberField("max_concurrent_missions", 1, 10)}
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Token budget per mission (500–200,000)</Label>
            {numberField("mission_token_budget", 500, 200000)}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[12px]">Daily token limit (1,000–5,000,000)</Label>
            {numberField("daily_token_limit", 1000, 5000000)}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Used today: {usage.data?.toLocaleString("en-IN") ?? "—"} of {form.daily_token_limit.toLocaleString("en-IN")} tokens.
        </p>
        <Button onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Save settings"}</Button>
        {!valid && <p className="text-[12px] text-rose-700">Enter values within the ranges shown.</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-heading text-[14px] font-semibold text-foreground">Audit log</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">Changes to modes, missions, prompts and chats. Deleted message text is never recorded.</p>
        <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto text-[12px]">
          {(audit.data ?? []).map((row) => (
            <li key={row.id} className="rounded-md border border-border px-3 py-1.5">
              <span className="font-medium text-foreground">{row.action}</span>
              <span className="text-muted-foreground"> · {formatTime(row.created_at)}</span>
              {Object.keys(row.detail ?? {}).length > 0 && (
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(row.detail)}</span>
              )}
            </li>
          ))}
          {audit.data?.length === 0 && <li className="text-muted-foreground">No changes recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
