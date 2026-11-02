import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, hint, icon: Icon, tone = "blue", className, to }: any) {
  const tones = {
    blue: "bg-primary/10 text-primary",
    violet: "bg-[hsl(var(--brand-violet)/0.12)] text-[hsl(var(--brand-violet))]",
    cyan: "bg-cyan-50 text-cyan-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const card = (
    <div
      className={cn(
        "surface group p-3 transition hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.04),0_18px_36px_-24px_rgba(15,23,42,0.35)] sm:p-4",
        to && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9.5px] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground sm:text-[11px] sm:tracking-[0.12em]">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8",
              (tones as Record<string, any>)[tone],
            )}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        )}
      </div>
      <p className="mt-1.5 font-heading text-[17px] font-bold leading-tight text-foreground tabular-nums sm:mt-2 sm:text-[22px]">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:mt-1 sm:text-[11px]">
          {hint}
        </p>
      )}
    </div>
  );
  if (!to) return card;
  return (
    <Link to={to} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {card}
    </Link>
  );
}
