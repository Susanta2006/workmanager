import { Link } from "@tanstack/react-router";
import { usePermissions } from "@/lib/permissions";
import { useOperatingMode, type Member, type OperatingMode } from "@/lib/virtual-team";

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-cyan-100 text-cyan-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-slate-200 text-slate-700",
];

function toneFor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function Avatar({ name, seed, size = "md" }: { name: string; seed: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-heading font-semibold ${toneFor(seed)} ${
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[12px]"
      }`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_approval: "bg-amber-50 text-amber-700 border-amber-200",
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  reviewing: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold capitalize ${
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatMoney(value: number) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function nameOf(members: Member[], id: string | null | undefined, fallback = "Employee") {
  return members.find((member) => member.id === id)?.display_name ?? fallback;
}

/** Read-only. Shows the operating mode that Settings controls, with a link to change it there. */
export function OperatingModeNotice() {
  const { canManageSettings } = usePermissions();
  const settings = useOperatingMode();
  const mode: OperatingMode = settings.data?.operating_mode ?? "solo";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] text-slate-600">
      <p>
        <span className="font-medium text-slate-800">Operating mode: {mode === "solo" ? "Solo" : "Team"}.</span>{" "}
        {mode === "solo"
          ? "Virtual Team is your main workspace."
          : "Virtual Team is off. The Team page manages your people."}
      </p>
      {canManageSettings && (
        <Link
          to="/settings"
          className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-[12px] font-medium text-foreground hover:bg-muted"
        >
          Change in Settings
        </Link>
      )}
    </div>
  );
}
