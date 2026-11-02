import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/reports", label: "Profit & expenses" },
  { to: "/reports/clients", label: "Clients" },
  { to: "/reports/projects", label: "Projects" },
  { to: "/reports/tasks", label: "Tasks" },
  { to: "/reports/expenses", label: "Expenses" },
];

export default function ReportTabs() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname.replace(/\/+$/, "") || "/",
  });

  return (
    <div
      className="scroll-slim mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/70 p-1"
      data-no-print
    >
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3 sm:text-[12.5px]",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
