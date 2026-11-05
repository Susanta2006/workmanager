import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/permissions";
import {
  fetchPromptVersions,
  fetchPrompts,
  restorePromptVersion,
  savePromptVersion,
  setPromptStatus,
  type Prompt,
} from "@/lib/virtual-team";
import { downloadText, StatusBadge } from "./shared";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
];

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "prompt";
}

function toMarkdown(prompt: Prompt) {
  return [
    `# ${prompt.title}`,
    "",
    `- Niche: ${prompt.niche}`,
    `- Category: ${prompt.category}`,
    `- Status: ${prompt.status}`,
    `- Version: ${prompt.version}`,
    prompt.variables.length ? `- Variables: ${prompt.variables.join(", ")}` : "",
    prompt.tags.length ? `- Tags: ${prompt.tags.join(", ")}` : "",
    "",
    prompt.intended_use ? `## Intended use\n\n${prompt.intended_use}\n` : "",
    "## Prompt",
    "",
    prompt.body,
    "",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");
}

function toPlainText(prompt: Prompt) {
  return `${prompt.title}\n${"=".repeat(prompt.title.length)}\n\nNiche: ${prompt.niche}\nCategory: ${prompt.category}\nVersion: ${prompt.version}\n\n${prompt.body}\n`;
}

export default function PromptLibrary() {
  const { canAssignWork, canManageSettings } = usePermissions();
  const prompts = useQuery({ queryKey: ["virtual-team", "prompts"], queryFn: fetchPrompts });
  const [query, setQuery] = useState("");
  const [niche, setNiche] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = prompts.data ?? [];
  const niches = useMemo(() => Array.from(new Set(all.map((item) => item.niche))).sort(), [all]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((item) => {
      if (niche !== "all" && item.niche !== niche) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!needle) return true;
      return [item.title, item.body, item.niche, item.category, item.intended_use, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [all, query, niche, status]);

  // Niche -> category -> prompts, so a collection reads as it was generated.
  const grouped = useMemo(() => {
    const byNiche = new Map<string, Map<string, Prompt[]>>();
    for (const item of filtered) {
      if (!byNiche.has(item.niche)) byNiche.set(item.niche, new Map());
      const categories = byNiche.get(item.niche)!;
      if (!categories.has(item.category)) categories.set(item.category, []);
      categories.get(item.category)!.push(item);
    }
    return byNiche;
  }, [filtered]);

  const selected = all.find((item) => item.id === selectedId) ?? null;

  function exportFiltered() {
    if (!filtered.length) return;
    const label = niche === "all" ? "prompt-library" : slug(niche);
    const content = filtered.map(toMarkdown).join("\n\n---\n\n");
    downloadText(`${label}.md`, content, "text/markdown;charset=utf-8");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prompts, tags, niches"
            aria-label="Search prompts"
            className="sm:flex-1"
          />
          <select
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            aria-label="Filter by niche"
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
          >
            <option value="all">All niches</option>
            {niches.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted-foreground">
            {filtered.length} of {all.length} prompt{all.length === 1 ? "" : "s"}
          </p>
          <Button size="sm" variant="outline" onClick={exportFiltered} disabled={!filtered.length}>
            Export list (.md)
          </Button>
        </div>

        {prompts.isLoading ? (
          <p className="text-[12.5px] text-muted-foreground">Loading the Prompt Library…</p>
        ) : all.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
            No prompts yet. Ask Manager AI to have the Prompt Engineer create a collection, for example “Manager, ask the Prompt Engineer to create prompts for the education niche.”
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
            No prompts match these filters.
          </p>
        ) : (
          Array.from(grouped.entries()).map(([nicheName, categories]) => (
            <div key={nicheName} className="space-y-2">
              <h3 className="font-heading text-[13px] font-semibold text-foreground">{nicheName}</h3>
              {Array.from(categories.entries()).map(([category, items]) => (
                <div key={category} className="space-y-1.5">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        selectedId === item.id ? "border-blue-300 bg-blue-50/60" : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">{item.title}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                          v{item.version}
                          {item.tags.length ? ` · ${item.tags.slice(0, 3).join(", ")}` : ""}
                        </span>
                      </span>
                      <StatusBadge status={item.status} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="min-w-0">
        {selected ? (
          <PromptDetail
            key={`${selected.id}-${selected.version}`}
            prompt={selected}
            canEdit={canAssignWork}
            canApprove={canManageSettings}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-[12.5px] text-muted-foreground">
            Select a prompt to read it, copy it, edit it or view its history.
          </div>
        )}
      </section>
    </div>
  );
}

function PromptDetail({
  prompt,
  canEdit,
  canApprove,
  onClose,
}: {
  prompt: Prompt;
  canEdit: boolean;
  canApprove: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(prompt.title);
  const [body, setBody] = useState(prompt.body);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);

  const history = useQuery({
    queryKey: ["virtual-team", "prompt-versions", prompt.id],
    queryFn: () => fetchPromptVersions(prompt.id),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["virtual-team", "prompts"] });
    await queryClient.invalidateQueries({ queryKey: ["virtual-team", "prompt-versions", prompt.id] });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt.body);
      toast.success("Prompt copied.");
    } catch {
      toast.error("Copying is not available in this browser. Select the text and copy it instead.");
    }
  }

  async function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle || !body.trim()) {
      toast.error("A prompt needs a title and a body.");
      return;
    }
    if (cleanTitle === prompt.title && body === prompt.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const version = await savePromptVersion(prompt.id, cleanTitle, body, reason.trim());
      toast.success(`Saved as version ${version}. The previous text is kept in the history.`);
      setEditing(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The prompt could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: Prompt["status"]) {
    setBusy(true);
    try {
      await setPromptStatus(prompt.id, next);
      toast.success(`Prompt is now ${next}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(version: number) {
    setBusy(true);
    try {
      const next = await restorePromptVersion(prompt.id, version);
      toast.success(`Version ${version} restored as version ${next}.`);
      setPreviewVersion(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The version could not be restored.");
    } finally {
      setBusy(false);
    }
  }

  const previewed = previewVersion !== null ? history.data?.find((item) => item.version === previewVersion) ?? null : null;

  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-[16px] font-semibold text-foreground">{prompt.title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {prompt.niche} · {prompt.category} · version {prompt.version} · updated{" "}
            {new Date(prompt.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={prompt.status} />
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </header>

      {prompt.intended_use && <p className="text-[12.5px] text-muted-foreground">{prompt.intended_use}</p>}

      {prompt.variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {prompt.variables.map((variable) => (
            <Badge key={variable} variant="outline" className="font-mono text-[11px]">{variable}</Badge>
          ))}
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} aria-label="Prompt title" />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} maxLength={50000} aria-label="Prompt text" className="font-mono text-[12.5px]" />
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Why are you changing it? (optional)"
            aria-label="Reason for the change"
          />
          <p className="text-[11.5px] text-muted-foreground">
            Saving keeps the current text as a version. An approved prompt returns to draft after an edit, so it can be approved again.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save as new version"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTitle(prompt.title); setBody(prompt.body); }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[12.5px] leading-relaxed text-foreground">
          {prompt.body}
        </pre>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>Copy</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(`${slug(prompt.title)}.txt`, toPlainText(prompt))}>
          Export .txt
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(`${slug(prompt.title)}.md`, toMarkdown(prompt), "text/markdown;charset=utf-8")}>
          Export .md
        </Button>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
        )}
        {canApprove && prompt.status !== "approved" && prompt.status !== "archived" && (
          <Button size="sm" onClick={() => changeStatus("approved")} disabled={busy}>Approve</Button>
        )}
        {canApprove && prompt.status === "approved" && (
          <Button size="sm" variant="outline" onClick={() => changeStatus("draft")} disabled={busy}>Move to draft</Button>
        )}
        {canApprove && prompt.status !== "archived" && (
          <Button size="sm" variant="ghost" onClick={() => changeStatus("archived")} disabled={busy}>Archive</Button>
        )}
        {canApprove && prompt.status === "archived" && (
          <Button size="sm" variant="outline" onClick={() => changeStatus("draft")} disabled={busy}>Restore</Button>
        )}
      </div>

      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-[12.5px] font-semibold text-foreground">Version history</h3>
        {history.isLoading ? (
          <p className="text-[12px] text-muted-foreground">Loading history…</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No earlier versions. Version {prompt.version} is the only version so far.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(history.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-[12px]">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">Version {item.version}</span>
                  <span className="text-muted-foreground">
                    {" "}· {new Date(item.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {item.change_reason ? ` · ${item.change_reason}` : ""}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewVersion(previewVersion === item.version ? null : item.version)}>
                    {previewVersion === item.version ? "Hide" : "View"}
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => restore(item.version)} disabled={busy}>Restore</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {previewed && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-1 text-[12px] font-medium text-foreground">{previewed.title}</p>
            <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap font-mono text-[12px] text-foreground">{previewed.body}</pre>
          </div>
        )}
      </section>
    </article>
  );
}
