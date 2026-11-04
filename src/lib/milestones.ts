import { fmtDate } from "@/lib/format";

export type MilestoneRecord = {
  id?: string;
  title?: string;
  description?: string;
  start_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  sequence_number?: number | string | null;
  sequence?: number | string | null;
  sort_order?: number | string | null;
  order?: number | string | null;
  created_date?: string | null;
  [key: string]: unknown;
};

function dateKey(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  // Date-only values are calendar dates, not UTC instants. Parse them without timezone shifts.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? timestamp
      : null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function sequenceValue(item: MilestoneRecord): number | null {
  for (const key of ["sequence_number", "sequence", "sort_order", "order"]) {
    const value = Number(item[key]);
    if (item[key] !== null && item[key] !== undefined && item[key] !== "" && Number.isFinite(value)) return value;
  }
  return null;
}

/** De-duplicates only repeated references to the same persisted milestone ID. */
export function sortProjectMilestones<T extends MilestoneRecord>(items: T[] = []): T[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (!item?.id) return true;
    const id = String(item.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique.sort((a, b) => {
    const aStart = dateKey(a.start_date) ?? dateKey(a.due_date);
    const bStart = dateKey(b.start_date) ?? dateKey(b.due_date);
    if (aStart === null && bStart !== null) return 1;
    if (aStart !== null && bStart === null) return -1;
    if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;

    const aDue = dateKey(a.due_date);
    const bDue = dateKey(b.due_date);
    if (aDue === null && bDue !== null) return 1;
    if (aDue !== null && bDue === null) return -1;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;

    const aSequence = sequenceValue(a);
    const bSequence = sequenceValue(b);
    if (aSequence !== null && bSequence !== null && aSequence !== bSequence) return aSequence - bSequence;

    const aCreated = dateKey(a.created_date);
    const bCreated = dateKey(b.created_date);
    if (aCreated !== null && bCreated !== null && aCreated !== bCreated) return aCreated - bCreated;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function milestoneTimeline(item: MilestoneRecord): string {
  const start = dateKey(item.start_date) !== null ? fmtDate(item.start_date) : "";
  const due = dateKey(item.due_date) !== null ? fmtDate(item.due_date) : "";
  if (start && due) return `${start} – ${due}`;
  if (start) return `Starts ${start}`;
  if (due) return `Due ${due}`;
  return "Schedule not specified";
}

export function milestoneStatusLabel(value: unknown): string {
  const normalized = String(value || "pending").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const labels: Record<string, string> = {
    pending: "Pending",
    not_started: "Pending",
    in_progress: "In Progress",
    active: "In Progress",
    completed: "Completed",
    complete: "Completed",
    done: "Completed",
    on_hold: "On Hold",
    hold: "On Hold",
    cancelled: "Cancelled",
    canceled: "Cancelled",
  };
  return labels[normalized] || (normalized ? normalized.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Pending");
}

export function milestoneSnapshot(items: MilestoneRecord[], projectId: string) {
  return sortProjectMilestones(items).map((item, index) => ({
    id: item.id || null,
    project_id: projectId,
    title: item.title || "",
    description: item.description || "",
    start_date: item.start_date || "",
    due_date: item.due_date || "",
    status: item.status || "pending",
    sequence_number: sequenceValue(item),
    created_date: item.created_date || null,
    display_order: index + 1,
  }));
}
