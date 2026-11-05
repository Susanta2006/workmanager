import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eraser, Loader2, Send, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import {
  ACTIVE_MISSION_STATUSES,
  clearVirtualTeamChat,
  deleteVirtualTeamChat,
  deleteVirtualTeamMessage,
  fetchConversations,
  fetchMessages,
  fetchMissions,
  postVirtualTeamNotice,
  saveMember,
  sendVirtualTeamMessage,
  type Member,
  type Message,
} from "@/lib/virtual-team";
import { Avatar, formatTime, StatusBadge } from "./shared";

type Props = {
  members: Member[];
  chatWith: string | null;
  onChatWithChange: (memberId: string | null) => void;
};

export default function ChatPanel({ members, chatWith, onChatWithChange }: Props) {
  const { user } = useAuth();
  const { canManageTeam } = usePermissions();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteChatOpen, setDeleteChatOpen] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const target = chatWith ? byId.get(chatWith) ?? null : null;
  const isGroup = !target;

  const conversations = useQuery({
    queryKey: ["virtual-team", "conversations"],
    queryFn: fetchConversations,
  });
  const conversation = isGroup
    ? conversations.data?.find((item) => item.kind === "group")
    : conversations.data?.find((item) => item.kind === "direct" && item.member_id === chatWith);

  const messages = useQuery({
    queryKey: ["virtual-team", "messages", conversation?.id ?? "none"],
    queryFn: () => fetchMessages(conversation!.id),
    enabled: Boolean(conversation?.id),
    refetchInterval: 4000,
  });

  const missions = useQuery({
    queryKey: ["virtual-team", "missions"],
    queryFn: fetchMissions,
    refetchInterval: 6000,
  });
  const activeMissions = (missions.data ?? []).filter((mission) => ACTIVE_MISSION_STATUSES.includes(mission.status));

  const isAdmin = user?.role === "admin";
  const employees = members.filter((member) => !member.is_manager && member.active);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.data?.length, chatWith]);

  async function refreshChat() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["virtual-team", "messages"] }),
      queryClient.invalidateQueries({ queryKey: ["virtual-team", "conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["virtual-team", "missions"] }),
    ]);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await sendVirtualTeamMessage(body, target?.id);
      setText("");
      if (result.proposal) setProposal(result.proposal);
      await refreshChat();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function insertMention(name: string) {
    setText((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@${name} `);
  }

  async function createProposedEmployee() {
    if (!proposal) return;
    setSavingProposal(true);
    try {
      await saveMember({
        display_name: proposal.display_name,
        member_key: proposal.member_key,
        job_title: proposal.job_title,
        role_description: proposal.role_description,
        gender: (["male", "female", "neutral"].includes(proposal.gender) ? proposal.gender : "neutral") as Member["gender"],
        personality: proposal.personality,
        communication_style: proposal.communication_style ?? "",
        skills: [],
      });
      // Announcing the hire is part of adding them. A failed notice does not undo the hire.
      await postVirtualTeamNotice(`${proposal.display_name} joined the team as ${proposal.job_title}.`).catch(() => undefined);
      toast.success(`${proposal.display_name} joined the team.`);
      setProposal(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["virtual-team", "members"] }),
        refreshChat(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The employee could not be created.");
    } finally {
      setSavingProposal(false);
    }
  }

  async function removeMessage() {
    if (!deleteMessageTarget) return;
    setDeletingMessage(true);
    try {
      await deleteVirtualTeamMessage(deleteMessageTarget.id);
      toast.success("Message deleted.");
      setDeleteMessageTarget(null);
      await refreshChat();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The message could not be deleted.");
    } finally {
      setDeletingMessage(false);
    }
  }

  async function clearChat() {
    if (!conversation) return;
    setClearing(true);
    try {
      const removed = await clearVirtualTeamChat(conversation.id);
      toast.success(`Chat cleared (${removed} message${removed === 1 ? "" : "s"} removed).`);
      setClearOpen(false);
      await refreshChat();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The chat could not be cleared.");
    } finally {
      setClearing(false);
    }
  }

  async function deleteChat() {
    if (!conversation || isGroup) return;
    setDeletingChat(true);
    try {
      const removed = await deleteVirtualTeamChat(conversation.id);
      toast.success(`Chat deleted (${removed} message${removed === 1 ? "" : "s"} removed).`);
      setDeleteChatOpen(false);
      onChatWithChange(null);
      await refreshChat();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The chat could not be deleted.");
    } finally {
      setDeletingChat(false);
    }
  }

  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        {!isGroup && (
          <button
            type="button"
            onClick={() => onChatWithChange(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Back to team chat"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {isGroup ? (
          <Avatar name="Manager AI" seed="manager" />
        ) : (
          <Avatar name={target!.display_name} seed={target!.member_key} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[14px] font-semibold text-foreground">
            {isGroup ? "Team chat" : target!.display_name}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {isGroup ? "Manager AI and the team" : target!.job_title}
          </p>
        </div>
        {isAdmin && conversation && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)} aria-label="Clear chat">
              <Eraser className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear chat</span>
            </Button>
            {!isGroup && (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => setDeleteChatOpen(true)}
                aria-label="Delete chat"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete chat</span>
              </Button>
            )}
          </div>
        )}
      </header>

      {activeMissions.length > 0 && (
        <div className="space-y-1 border-b border-border bg-blue-50/60 px-4 py-2">
          {activeMissions.slice(0, 3).map((mission) => (
            <div key={mission.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-foreground">{mission.title}</span>
              <StatusBadge status={mission.status} />
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {conversations.isLoading || messages.isLoading ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </div>
        ) : (messages.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-[12.5px] text-muted-foreground">
            {isGroup
              ? "No messages yet. Ask Manager AI for something, or mention an employee with @name."
              : `No messages with ${target!.display_name} yet.`}
          </p>
        ) : (
          (messages.data ?? []).map((message) => {
            if (message.sender_kind === "system") {
              return (
                <p key={message.id} className="text-center text-[11.5px] text-muted-foreground">
                  {message.body}
                </p>
              );
            }
            const mine = message.sender_kind === "admin" && message.sender_user_id === user?.id;
            const member = byId.get(message.sender_member_id ?? "");
            const sender =
              message.sender_kind === "admin"
                ? { name: mine ? "You" : "Admin", seed: "admin" }
                : message.sender_kind === "manager"
                  ? { name: "Manager AI", seed: "manager" }
                  : message.sender_kind === "member"
                    ? { name: member?.display_name ?? "Team member", seed: member?.member_key ?? "member" }
                    : { name: "Member", seed: "member" };
            return (
              <div key={message.id} className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar name={sender.name} seed={sender.seed} size="sm" />
                <div className={`max-w-[78%] ${mine ? "items-end text-right" : ""}`}>
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{sender.name}</span>
                    <span>{formatTime(message.created_at)}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteMessageTarget(message)}
                        className="text-muted-foreground opacity-0 transition hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                        aria-label="Delete message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-[13px] leading-relaxed ${
                      mine ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                    }`}
                  >
                    {message.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {proposal && (
        <div className="border-t border-border bg-amber-50/70 px-4 py-3">
          <p className="text-[12.5px] text-foreground">
            New colleague proposed: <strong>{proposal.display_name}</strong>, {proposal.job_title}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={createProposedEmployee} disabled={savingProposal || !canManageTeam}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              {savingProposal ? "Adding…" : "Add to team"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)} disabled={savingProposal}>
              Not now
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={send} className="border-t border-border p-3">
        {isGroup && employees.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {employees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => insertMention(employee.display_name)}
                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11.5px] text-muted-foreground hover:border-blue-300 hover:text-blue-700"
              >
                @{employee.display_name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={4000}
            placeholder={isGroup ? "Message Manager AI, or type @name to ask an employee" : `Message ${target!.display_name}`}
            className="min-h-[44px] resize-none text-[13px]"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Enter sends. Shift+Enter adds a new line.</p>
      </form>

      <ConfirmDialog
        open={Boolean(deleteMessageTarget)}
        onOpenChange={(open: boolean) => !open && setDeleteMessageTarget(null)}
        title="Delete this message?"
        description="The message is permanently removed from the database. This cannot be undone."
        confirmLabel="Delete message"
        destructive
        busy={deletingMessage}
        onConfirm={removeMessage}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={isGroup ? "Clear the team chat?" : `Clear chat with ${target?.display_name ?? ""}?`}
        description="Every message in this chat is permanently deleted from the database, for everyone. The chat itself stays. Missions, tasks, deliverables and the Prompt Library are not affected. This cannot be undone."
        confirmLabel="Clear chat"
        destructive
        busy={clearing}
        onConfirm={clearChat}
      />
      <ConfirmDialog
        open={deleteChatOpen}
        onOpenChange={setDeleteChatOpen}
        title={`Delete chat with ${target?.display_name ?? "this employee"}?`}
        description="This permanently deletes the direct chat and all of its messages from the database. Work the employee did in missions is kept. This cannot be undone."
        confirmLabel="Delete chat"
        destructive
        busy={deletingChat}
        onConfirm={deleteChat}
      />
    </div>
  );
}
