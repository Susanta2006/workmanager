import { cn } from "@/lib/utils";

export default function DataToolbar({ children, className }: any) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 rounded-xl border border-border bg-card/70 p-3 sm:flex-row sm:items-center",
        className,
      )}
      data-no-print
    >
      {children}
    </div>
  );
}
