import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Bot,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions, ROLE_LABELS } from "@/lib/permissions";
import { useOrgSettings } from "@/lib/org-settings";
import { refreshWorkspaceData } from "@/lib/sync";
import { countUnreadNotifications } from "@/lib/db";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useOperatingMode } from "@/lib/virtual-team";
import GlobalSearch from "@/components/layout/GlobalSearch";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import SiteFooter from "@/components/layout/SiteFooter";
import { initials } from "@/lib/format";

export default function AppShell({ children }: any) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const { can, roleLabel } = usePermissions();
  const { settings } = useOrgSettings();

  useEffect(() => {
    const stored = window.localStorage.getItem("workmanager-sidebar-v2");
    if (stored === "collapsed") setCollapsed(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(
        "workmanager-sidebar-v2",
        next ? "collapsed" : "open",
      );
      return next;
    });
  };

  // Live notifications: any change to a Notification record refreshes the bell and the unread count.
  const liveQueryClient = useQueryClient();
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel("workspace-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "records" },
        (payload) => {
          // Old rows on delete may not carry the entity name, so refresh in that case too.
          const entity = (payload as any).new?.entity ?? (payload as any).old?.entity;
          if (!entity || entity === "Notification" || entity === "Task") {
            liveQueryClient.invalidateQueries({ queryKey: ["notifications"] });
            liveQueryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
          }
          if (!entity || entity !== "Notification") {
            refreshWorkspaceData(liveQueryClient);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveQueryClient]);

  const unread = useQuery({
    queryKey: ["notifications", "unread-count", user?.id],
    queryFn: countUnreadNotifications,
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const badge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!user) {
      badge.clearAppBadge?.().catch((error: unknown) => console.warn("Could not clear the installed-app badge.", error));
      return;
    }
    if (!unread.isSuccess) return;
    const count = unread.data;
    const operation = count > 0 ? badge.setAppBadge?.(count) : badge.clearAppBadge?.();
    operation?.catch((error: unknown) => console.warn("Could not update the installed-app badge.", error));
  }, [unread.data, unread.isSuccess, user]);

  // Solo mode: the Team slot becomes Virtual Team. Team mode: the human Team entry is unchanged.
  // Permission is still checked against the existing "team" key, so no permission rules change.
  const virtualMode = useOperatingMode();
  const soloMode = virtualMode.data?.operating_mode === "solo";
  const navSource = soloMode
    ? NAV_ITEMS.map((item) =>
        item.key === "team"
          ? { ...item, label: "Virtual Team", to: "/virtual-team", icon: Bot }
          : item,
      )
    : NAV_ITEMS;
  const items = navSource.filter((item) => can(item.key));
  const current = items.find((item) =>
    pathname.startsWith(item.to),
  );

  return (
    <div className="flex min-h-screen w-full bg-transparent">
      <aside
        data-no-print
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-border/80 bg-card/95 backdrop-blur transition-[width] duration-300 lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          items={items}
          pathname={pathname}
          settings={settings}
        />
        <SidebarFooter collapsed={collapsed} roleLabel={roleLabel} />
        <button
          onClick={toggle}
          className="absolute -right-3 top-20 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:text-foreground lg:flex"
          aria-label="Toggle sidebar"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" data-no-print>
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border bg-card">
            <div className="flex justify-end p-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent
              collapsed={false}
              items={items}
              pathname={pathname}
              settings={settings}
            />
            <SidebarFooter collapsed={false} roleLabel={roleLabel} />
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin] duration-300",
          collapsed ? "lg:ml-[76px]" : "lg:ml-[264px]",
        )}
      >
        <header
          data-no-print
          className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-1.5 border-b border-border/80 bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:h-[calc(4rem+env(safe-area-inset-top))] sm:gap-3 sm:px-6"
        >
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 h-9 w-9 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-heading text-[14px] font-semibold leading-tight text-foreground sm:text-[15px]">
              {current?.label || "Workspace"}
            </span>
            <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {settings.company_name}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <Link to="/notifications" className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <Bell className="h-[18px] w-[18px]" />
              </Button>
              {(unread.data ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unread.data}
                </span>
              )}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-card p-0.5 pr-2.5 transition hover:border-primary/40">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-violet))] text-[11px] font-semibold text-white">
                      {initials(user?.full_name || user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate text-xs font-medium sm:block">
                    {user?.full_name || user?.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="text-sm">
                    {user?.full_name || "Team member"}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {user?.email} · {(ROLE_LABELS as Record<string, any>)[user?.role ?? ""] || roleLabel}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex min-w-0 flex-1 flex-col px-3 pb-24 pt-4 sm:px-6 sm:pb-8 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] flex-1">{children}</div>
          <div className="mx-auto mt-8 w-full max-w-[1400px]">
            <SiteFooter />
          </div>
        </main>

        <MobileTabBar
          items={items}
          pathname={pathname}
          onMore={() => setMobileOpen(true)}
        />
      </div>
    </div>
  );
}

const MOBILE_KEYS = ["dashboard", "clients", "documents", "reports"];

/** Bottom tab bar for phones — the four everyday destinations plus everything else. */
function MobileTabBar({ items, pathname, onMore }: any) {
  const tabs = MOBILE_KEYS.map((key) =>
    items.find((item: any) => item.key === key),
  ).filter(Boolean);
  return (
    <nav
      data-no-print
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {tabs.map((tab) => {
        const active =
          pathname.startsWith(tab.to);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="truncate">{tab.label.split(" ")[0]}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
      >
        <Menu className="h-[18px] w-[18px]" />
        <span>More</span>
      </button>
    </nav>
  );
}

function SidebarContent({ collapsed, items, pathname, settings }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link
        to="/dashboard"
        className={cn(
          "flex items-center gap-3 px-5 pb-5 pt-5",
          collapsed && "justify-center px-2",
        )}
      >
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt="Logo"
            className="h-9 w-9 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-violet))] text-white">
            <Sparkles className="h-4 w-4" />
          </span>
        )}
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate font-heading text-[13px] font-bold leading-tight text-foreground">
              {settings.company_name || "WorkManager"}
            </span>
            <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Business Workspace
            </span>
          </span>
        )}
      </Link>

      <nav className="scroll-slim flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item: any) => {
          const active =
            pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                active ? "bg-primary text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-foreground",
                collapsed && "justify-center px-2",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" />
              )}
              <Icon
                className={cn(
                  "h-[17px] w-[17px] shrink-0",
                  active ? "text-white" : "text-slate-400 group-hover:text-slate-600",
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarFooter({ collapsed, roleLabel }: any) {
  return (
    <div
      className={cn("border-t border-border/70 px-4 py-3", collapsed && "px-2")}
    >
      {collapsed ? (
        <div className="flex justify-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {roleLabel?.[0]}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="truncate">Signed in as {roleLabel}</span>
        </div>
      )}
    </div>
  );
}
