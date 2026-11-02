import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

const CAPABILITIES = [
  {
    icon: Users,
    title: "Clients & relationships",
    description: "Keep client details together and connect the people behind every project.",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  },
  {
    icon: FolderKanban,
    title: "Projects & tasks",
    description: "Organize work, assign owners, set deadlines, and follow progress in one place.",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  },
  {
    icon: BellRing,
    title: "Timely notifications",
    description: "Keep task updates and upcoming deadlines visible to the right people.",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  },
  {
    icon: FileText,
    title: "Business documents",
    description: "Create and organize the documents your team needs to keep work moving.",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  {
    icon: Wallet,
    title: "Payments & expenses",
    description: "Track incoming payments and business expenses alongside your work.",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  },
  {
    icon: BarChart3,
    title: "Reports at a glance",
    description: "Review project, task, client, and financial activity with live reports.",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Choose your workspace",
    description: "Get your company workspace code, then continue with Google. Your profile details come from your Google account.",
  },
  {
    number: "02",
    title: "Get the right access",
    description: "The designated founder is activated automatically; other accounts wait for their company admin’s approval.",
  },
  {
    number: "03",
    title: "Bring work together",
    description: "Coordinate people, projects, deadlines, documents, and finances in one shared workspace.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorkManager · One workspace for your business" },
      {
        name: "description",
        content:
          "Coordinate clients, projects, team tasks, deadlines, documents, payments, expenses, and reports in one business workspace.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [navigate, user]);

  return (
    <div className="overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <img src="/favicon.ico" alt="" className="h-8 w-8 rounded-xl object-cover sm:h-9 sm:w-9" />
          <span className="font-heading text-sm font-bold tracking-tight sm:text-base">WorkManager</span>
        </Link>
      </header>

      <main>
        <section className="relative isolate">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[580px] bg-[linear-gradient(180deg,hsl(214_95%_97%),transparent_80%)] dark:bg-[linear-gradient(180deg,hsl(217_45%_13%),transparent_80%)] sm:h-[680px] sm:bg-[radial-gradient(ellipse_at_18%_10%,hsl(214_95%_92%/0.8),transparent_44%),radial-gradient(ellipse_at_87%_23%,hsl(271_80%_94%/0.72),transparent_40%)] sm:dark:bg-[radial-gradient(ellipse_at_18%_10%,hsl(217_70%_20%/0.55),transparent_44%),radial-gradient(ellipse_at_87%_-20%,hsl(271_60%_20%/0.45),transparent_40%)]"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-5 px-3 pb-8 pt-7 sm:gap-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="max-w-2xl">
              <h1 className="max-w-xl text-[2.1rem] font-bold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[3.6rem]">
                All your work, <span className="brand-text">moving together.</span>
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground sm:mt-5 sm:text-lg sm:leading-8">
                Connect your clients, people, projects, deadlines, and finances in one clear workspace.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                <Button asChild size="lg" className="h-11 gap-2 rounded-xl px-5 shadow-sm sm:h-12 sm:px-6 sm:shadow-md sm:shadow-primary/20">
                  <Link to="/register">
                    Register
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-11 rounded-xl bg-background/80 px-5 sm:h-12 sm:px-6">
                  <Link to="/login">Sign in to your workspace</Link>
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted-foreground sm:mt-6 sm:gap-x-5 sm:text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Secure Google sign-in
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Admin-approved access
                </span>
              </div>
              <p className="mt-4 text-sm">
                <Link to="/security" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                  Read our security overview <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </p>
            </div>

            <WorkspacePreview />
          </div>
        </section>

        <section aria-label="Workspace overview" className="border-y border-border/70 bg-background/60">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-3 gap-y-4 px-3 py-4 sm:grid-cols-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-8">
            {[
              { label: "Clients", detail: "Relationships in one place", icon: Users },
              { label: "Projects", detail: "Work with clear ownership", icon: FolderKanban },
              { label: "People", detail: "Roles that work together", icon: BriefcaseBusiness },
              { label: "Finances", detail: "Payments and expenses", icon: CircleDollarSign },
            ].map(({ label, detail, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold sm:text-sm">{label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground sm:text-xs">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="scroll-mt-8 px-3 py-10 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary sm:text-xs">Your day-to-day, connected</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">Less switching. More meaningful progress.</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Give the whole team a shared view of what is happening, what is next, and where support is needed.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, description, color }) => (
                <article key={title} className="surface p-3.5 transition duration-200 sm:p-6 sm:hover:-translate-y-0.5 sm:hover:shadow-lg">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${color}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-[13px] font-semibold leading-5 sm:mt-5 sm:text-base">{title}</h3>
                  <p className="mt-1.5 text-[11px] leading-[1.35rem] text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/60 px-3 py-10 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-7 sm:gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary sm:text-xs">A team with clear ownership</p>
              <h2 className="mt-2 max-w-lg text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">
                The right people, with the right view of the work.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:mt-4 sm:text-base sm:leading-7">
                Admins can approve requests, shape the team, and assign leaders. Leaders help coordinate member work,
                while members can focus on their tasks and keep progress up to date.
              </p>
              <a href="#access" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline sm:mt-6">
                See how access works <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3">
              <RoleCard
                icon={ShieldCheck}
                title="Admins"
                description="Review access requests, manage the team, assign leaders, and oversee workspace operations."
                accent="text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-400/10"
              />
              <RoleCard
                icon={ClipboardCheck}
                title="Leaders"
                description="Coordinate work divisions and help members stay aligned on assignments and deadlines."
                accent="text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-400/10"
              />
              <RoleCard
                icon={CheckCircle2}
                title="Members"
                description="See assigned work, update progress, and mark tasks done when they are complete."
                accent="text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-400/10"
              />
              <RoleCard
                icon={BellRing}
                title="Everyone"
                description="Stay aware of task activity and deadlines with in-app notifications."
                accent="text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-400/10"
              />
            </div>
          </div>
        </section>

        <section id="access" className="scroll-mt-8 px-3 py-10 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">A considered start</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:mt-3 sm:text-4xl">Get your team set up with confidence.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:mt-4 sm:text-base sm:leading-7">
                Workspace access is requested first and approved by an admin—not automatically opened to every signup.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4">
              {STEPS.map((step) => (
                <article key={step.number} className="relative rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-7">
                  <span className="text-xs font-bold tracking-[0.16em] text-primary">{step.number}</span>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </article>
              ))}
            </div>
            <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:mt-10 sm:p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">What happens when I request access?</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Choose Member or Admin on the registration page and continue with Google. Your request stays pending
                    until the founding admin reviews it. Approved accounts continue with Google sign-in and the
                    workspace passcode step.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="mx-auto w-full max-w-[610px] lg:mx-0 lg:ml-auto">
      <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold">Your workspace</p>
              <p className="text-[10px] text-muted-foreground">Work, in one place</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            On track
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
          <div className="px-2 first:pl-0">
            <p className="text-[10px] text-muted-foreground">Clients</p>
            <p className="mt-0.5 text-xs font-semibold">Connected</p>
          </div>
          <div className="px-2">
            <p className="text-[10px] text-muted-foreground">Projects</p>
            <p className="mt-0.5 text-xs font-semibold">In progress</p>
          </div>
          <div className="px-2 last:pr-0">
            <p className="text-[10px] text-muted-foreground">Team tasks</p>
            <p className="mt-0.5 text-xs font-semibold">Up to date</p>
          </div>
        </div>
      </div>
      <div className="relative hidden sm:block">
      <div aria-hidden="true" className="absolute -inset-5 hidden rounded-[2rem] bg-gradient-to-br from-blue-400/20 via-violet-300/15 to-cyan-300/20 blur-2xl sm:block" />
      <div className="relative rounded-2xl border border-white/70 bg-white p-1.5 shadow-[0_10px_28px_-20px_rgba(29,78,216,0.3)] sm:rounded-[1.4rem] sm:p-3 sm:shadow-[0_35px_90px_-40px_rgba(29,78,216,0.42)] sm:backdrop-blur dark:border-white/10 dark:bg-slate-950/85">
        <div className="overflow-hidden rounded-[1rem] border border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Workspace overview</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">A sample view of your work</p>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <BellRing className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="p-3 sm:p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Good morning</p>
                <p className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">Here’s your team at a glance</p>
              </div>
              <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300 sm:inline-flex">
                Workspace preview
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <PreviewStat icon={FolderKanban} label="Projects" value="In progress" tone="blue" />
              <PreviewStat icon={CheckCircle2} label="Tasks" value="On track" tone="green" />
              <PreviewStat icon={Wallet} label="Payments" value="Up to date" tone="violet" />
            </div>
            <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-[1.25fr_0.75fr]">
              <div className="hidden rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950 sm:block">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Project progress</p>
                  <span className="text-[10px] text-slate-500">This week</span>
                </div>
                <div className="mt-4 flex h-[82px] items-end gap-2 px-1" aria-hidden="true">
                  {[34, 52, 43, 69, 60, 84, 74, 100].map((height, index) => (
                    <span
                      key={index}
                      className={`flex-1 rounded-t-md ${index === 7 ? "bg-violet-400" : "bg-blue-500/75"}`}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[9px] text-slate-400">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
                </div>
              </div>
              <div className="hidden rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950 sm:block">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Team activity</p>
                <div className="mt-3 space-y-3">
                  {[
                    { initials: "AK", name: "Aarav", action: "updated a task", color: "bg-sky-100 text-sky-700" },
                    { initials: "MS", name: "Mira", action: "shared progress", color: "bg-violet-100 text-violet-700" },
                    { initials: "RJ", name: "Rohan", action: "finished a task", color: "bg-emerald-100 text-emerald-700" },
                  ].map((person) => (
                    <div key={person.initials} className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${person.color}`}>
                        {person.initials}
                      </span>
                      <p className="min-w-0 text-[9px] leading-4 text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{person.name}</span>{" "}
                        {person.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-slate-800 dark:text-slate-100">Today’s focus</p>
                  <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">Prepare client proposal</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                  Due soon
                </span>
              </div>
            </div>
            <div className="mt-3 hidden rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950 sm:block">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Upcoming work</p>
                <span className="text-[10px] font-medium text-primary">View tasks <ArrowRight className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-slate-100 py-2 text-[10px] dark:border-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-200">Prepare client proposal</span>
                <span className="text-slate-500">Mira S.</span>
                <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">Due soon</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-slate-100 py-2 text-[10px] dark:border-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-200">Review project milestones</span>
                <span className="text-slate-500">Aarav K.</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <Check className="h-3 w-3" aria-hidden="true" /> On track
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function PreviewStat({ icon: Icon, label, value, tone }: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  tone: "blue" | "green" | "violet";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-950 sm:p-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="mt-2 text-[9px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-[10px] font-bold text-slate-800 dark:text-slate-100 sm:text-[11px]">{value}</p>
    </div>
  );
}

function RoleCard({ icon: Icon, title, description, accent }: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-3.5 shadow-sm sm:rounded-2xl sm:p-6 sm:transition sm:hover:shadow-md">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${accent}`}>
        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
      </span>
      <h3 className="mt-2.5 text-[13px] font-semibold sm:mt-4 sm:text-base">{title}</h3>
      <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
    </article>
  );
}
