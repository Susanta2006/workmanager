import { cn } from "@/lib/utils";

export default function StatusBadge({ status, map = {}, className }: any) {
  const entry = (map as Record<string, any>)[status] || {
    label: String(status || "—").replace(/_/g, " "),
    className: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        entry.className,
        className,
      )}
    >
      {entry.label}
    </span>
  );
}
