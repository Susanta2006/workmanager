import { Inbox } from "lucide-react";

export default function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon: Icon = Inbox,
}: any) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-heading text-sm font-semibold text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
