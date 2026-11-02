import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, FolderKanban, Users, X } from "lucide-react";
import { fetchAll } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchClients } from "@/lib/clients";

export default function GlobalSearch() {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["global-search-index"],
    queryFn: async () => {
      const [clients, projects, documents] = await Promise.all([
        fetchClients(),
        fetchAll("Project", null),
        fetchAll("Document", null),
      ]);
      return { clients, projects, documents };
    },
    staleTime: 60_000,
  });

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2 || !data) return [];
    const matches: any[] = [];
    data.clients.forEach((c: any) => {
      if (
        `${c.name} ${c.email} ${c.client_code}`.toLowerCase().includes(needle)
      )
        matches.push({
          id: `c-${c.id}`,
          kind: "Client",
          label: c.name,
          sub: c.email || c.client_code,
          icon: Users,
          to: "/clients/$clientId",
          params: { clientId: c.id },
        });
    });
    data.projects.forEach((p: any) => {
      if (`${p.title} ${p.project_code}`.toLowerCase().includes(needle))
        matches.push({
          id: `p-${p.id}`,
          kind: "Project",
          label: p.title,
          sub: p.project_code,
          icon: FolderKanban,
          to: "/projects/$projectId",
          params: { projectId: p.id },
        });
    });
    data.documents.forEach((d: any) => {
      if (`${d.doc_number} ${d.title}`.toLowerCase().includes(needle))
        matches.push({
          id: `d-${d.id}`,
          kind: "Document",
          label: d.doc_number,
          sub: d.title || d.doc_type,
          icon: FileText,
          to: "/documents/$documentId",
          params: { documentId: d.id },
        });
    });
    return matches.slice(0, 6);
  }, [term, data]);

  const go = (result: any) => {
    setTerm("");
    setOpen(false);
    setMobileOpen(false);
    navigate({ to: result.to, params: result.params });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
        aria-label="Search"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-background md:hidden"
          data-no-print
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search clients, projects, documents…"
                className="h-11 bg-card pl-9 text-[14px]"
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
            {term.trim().length < 2 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                Type at least two letters to search.
              </p>
            ) : results.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                No matching records
              </p>
            ) : (
              results.map((result) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    onClick={() => go(result)}
                    className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {result.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {result.kind} · {result.sub || "—"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="relative hidden w-[220px] md:block lg:w-[300px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search clients, projects, documents…"
          className="h-9 border-border bg-card pl-9 text-[13px] shadow-none"
        />
        {open && term.trim().length >= 2 && (
          <div className="absolute right-0 top-11 z-50 w-[340px] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No matching records
              </p>
            ) : (
              results.map((result) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(result)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50",
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {result.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {result.kind} · {result.sub || "—"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}
