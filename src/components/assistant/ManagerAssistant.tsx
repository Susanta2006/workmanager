import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { refreshWorkspaceData } from "@/lib/sync";
import { DEVELOPER } from "@/lib/developer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "What needs my attention today?",
  "Draft a friendly payment reminder",
  "How do I record a payment?",
  "Set a deadline for an overdue task",
];

const STATUS_TEXT = {
  working: "Working on it…",
  done: "Done",
  failed: "Not applied. Try again, or make the change in the app.",
  dismissed: "Dismissed",
};

async function authHeaders() {
  const { data } = await getSupabase().auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token || ""}`,
  };
}

// Floating chat bubble. Opens a compact panel; Manager proposes changes and only applies them after Confirm.
export default function ManagerAssistant() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstName = (user?.full_name || "").trim().split(/\s+/)[0] || "there";

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("manager:open", onOpen);
    return () => window.removeEventListener("manager:open", onOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  const updateProposal = (messageIndex: any, proposalIndex: any, status: any) =>
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === messageIndex
          ? { ...msg, proposals: msg.proposals.map((p: any, j: any) => (j === proposalIndex ? { ...p, status } : p)) }
          : msg,
      ),
    );

  const send = async (raw: any) => {
    const content = raw.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ messages: next.slice(-30).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Manager could not answer right now.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "Here is what I suggest:",
          proposals: (data.proposals || []).map((p: any) => ({ ...p, status: "pending" })),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (messageIndex: any, proposalIndex: any) => {
    const proposal = messages[messageIndex].proposals[proposalIndex];
    updateProposal(messageIndex, proposalIndex, "working");
    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name: proposal.name, args: proposal.args }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not make that change.");
      updateProposal(messageIndex, proposalIndex, "done");
      toast.success(data.message || "Done");
      refreshWorkspaceData(queryClient);
    } catch (err: any) {
      updateProposal(messageIndex, proposalIndex, "failed");
      toast.error(err.message);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Manager assistant"
          className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:scale-105 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 right-4 z-40 flex h-[min(560px,72vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:bottom-6 sm:right-6">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[14px] font-semibold leading-tight">Manager</p>
              <p className="truncate text-[10.5px] text-muted-foreground">
                Developed by {DEVELOPER.name} · {DEVELOPER.company}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-3 py-2 text-[13px] leading-relaxed">
              Hi {firstName}, I'm Manager. I can see your clients, projects, tasks and documents. I can help you
              draft messages, set deadlines, leave reminders and explain how to do things in WorkManager.
            </div>
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, mi) => (
              <div key={mi} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-md bg-primary text-white"
                      : "rounded-bl-md bg-secondary text-foreground",
                    msg.error && "text-rose-600",
                  )}
                >
                  {msg.content}
                </div>
                {msg.proposals?.map((p: any, pi: any) => (
                  <div
                    key={pi}
                    className="mt-1.5 w-[85%] rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-[12.5px]"
                  >
                    <p className="font-medium">{p.summary}</p>
                    {p.status === "pending" ? (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => confirm(mi, pi)}>Confirm</Button>
                        <Button size="sm" variant="ghost" onClick={() => updateProposal(mi, pi, "dismissed")}>
                          Dismiss
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground">{(STATUS_TEXT as Record<string, any>)[p.status]}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Manager is typing…
              </div>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Manager…"
              maxLength={2000}
              className="h-9 text-[13px]"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
