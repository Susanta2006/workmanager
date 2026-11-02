import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, FilePlus2, FolderPlus, ListPlus, UserPlus } from "lucide-react";
import { daysUntil, fmtDate, inr } from "@/lib/format";
import { Button } from "@/components/ui/button";

const QUICK_ACTIONS = [
  { label: "New quotation", to: "/documents/new", icon: FilePlus2 },
  { label: "New client", to: "/clients", icon: UserPlus },
  { label: "New project", to: "/projects", icon: FolderPlus },
  { label: "Add task", to: "/tasks", icon: ListPlus },
];

const TONES = {
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-primary/10 text-primary",
};

// Greeting, quick actions and a "needs attention" list. Every item links to the record it is about.
export default function DashboardHome({ user, overdueInvoices, tasks, projects }: any) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (user?.full_name || "").trim().split(/\s+/)[0] || "there";

  const openTasks = tasks.filter((t: any) => !["completed", "cancelled"].includes(t.status));
  const overdueTasks = openTasks.filter((t: any) => {
    const days = daysUntil(t.due_date);
    return days !== null && days < 0;
  });
  const dueSoonProjects = projects.filter((p: any) => {
    const days = daysUntil(p.deadline);
    return days !== null && days >= 0 && days <= 7 && !["completed", "delivered", "cancelled"].includes(p.status);
  });

  const items = [
    ...overdueInvoices.slice(0, 3).map((doc: any) => ({
      key: `doc-${doc.id}`,
      tone: "rose",
      text: `Invoice ${doc.doc_number || ""} is overdue · ${inr(doc.balance_due)} to collect`,
      to: "/documents/$documentId",
      params: { documentId: doc.id },
    })),
    ...overdueTasks.slice(0, 3).map((task: any) => ({
      key: `task-${task.id}`,
      tone: "amber",
      text: `Task "${task.title}" was due ${fmtDate(task.due_date)}`,
      to: "/tasks",
    })),
    ...dueSoonProjects.slice(0, 3).map((project: any) => ({
      key: `project-${project.id}`,
      tone: "blue",
      text: `Project "${project.title}" is due ${fmtDate(project.deadline)}`,
      to: "/projects/$projectId",
      params: { projectId: project.id },
    })),
  ];

  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted-foreground">{fmtDate(new Date())}</p>
          <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
            {greeting}, {first}
          </h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Button key={action.to} asChild size="sm" variant="secondary">
            <Link to={action.to}>
              <action.icon className="mr-1.5 h-3.5 w-3.5" /> {action.label}
            </Link>
          </Button>
        ))}
      </div>

      <div className="surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="font-heading text-[14px] font-semibold">Needs attention</h3>
          <span className="ml-auto text-[12px] text-muted-foreground">{items.length}</span>
        </div>
        {items.length ? (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  params={item.params}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition hover:bg-secondary"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${(TONES as Record<string, any>)[item.tone]?.split(" ")[0] || "bg-primary/10"}`} />
                  <span className="min-w-0 flex-1 truncate">{item.text}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nothing urgent right now. A good time to follow up on open quotations.
          </p>
        )}
      </div>
    </div>
  );
}
