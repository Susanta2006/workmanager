import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/db";
import { businessDateISO, summarizeFinance, type FinanceSummary } from "@/lib/virtual-team-finance";

export type OperatingMode = "solo" | "team";

export type Member = {
  id: string;
  member_key: string;
  display_name: string;
  job_title: string;
  role_description: string;
  gender: "male" | "female" | "neutral";
  personality: string;
  communication_style: string;
  skills: string[];
  is_manager: boolean;
  active: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_kind: "admin" | "member" | "manager" | "system";
  sender_member_id: string | null;
  sender_user_id: string | null;
  body: string;
  mission_id: string | null;
  created_at: string;
};

export type Conversation = { id: string; kind: "group" | "direct"; member_id: string | null };

export type Mission = {
  id: string;
  conversation_id: string | null;
  title: string;
  request: string;
  status: string;
  origin: string;
  summary: string;
  error: string;
  token_budget: number;
  tokens_used: number;
  created_at: string;
  completed_at: string | null;
};

export type Task = {
  id: string;
  mission_id: string;
  member_id: string | null;
  position: number;
  instruction: string;
  status: string;
  attempts: number;
  last_error: string;
};

export type Deliverable = {
  id: string;
  mission_id: string;
  member_id: string | null;
  title: string;
  format: string;
  content: string;
  created_at: string;
};

export type Prompt = {
  id: string;
  niche: string;
  category: string;
  title: string;
  body: string;
  intended_use: string;
  variables: string[];
  tags: string[];
  status: "draft" | "approved" | "archived";
  version: number;
  mission_id: string | null;
  created_by_member_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type PromptVersion = {
  id: string;
  prompt_id: string;
  version: number;
  title: string;
  body: string;
  change_reason: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type Settings = {
  operating_mode: OperatingMode;
  background_enabled: boolean;
  max_concurrent_missions: number;
  mission_token_budget: number;
  daily_token_limit: number;
};

export const DEFAULT_SETTINGS: Settings = {
  operating_mode: "team",
  background_enabled: true,
  max_concurrent_missions: 3,
  mission_token_budget: 8000,
  daily_token_limit: 200000,
};

export const ACTIVE_MISSION_STATUSES = ["awaiting_approval", "queued", "running", "reviewing", "paused"];

async function authHeaders() {
  const { data } = await getSupabase().auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token || ""}`,
  };
}

/** Opens the Virtual Team for this company: settings, the seeded employees, Manager AI and the team chat. */
export async function bootstrapVirtualTeam() {
  const { error } = await getSupabase().rpc("virtual_team_bootstrap");
  if (error) throw error;
}

/**
 * The saved operating mode. Read-only and does not create anything, so it is safe to call from the
 * app shell on every page. Defaults to Team until the Admin switches.
 */
export function useOperatingMode() {
  return useQuery({
    queryKey: ["virtual-team", "settings"],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await getSupabase()
        .from("virtual_team_settings")
        .select("operating_mode, background_enabled, max_concurrent_missions, mission_token_budget, daily_token_limit")
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as Settings;
    },
    staleTime: 30_000,
    retry: false,
  });
}

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_members")
    .select("*")
    .order("is_manager", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await getSupabase().from("virtual_team_conversations").select("id, kind, member_id");
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Message[];
}

/** Sends a message through the server, which saves it and produces the reply. */
export async function sendVirtualTeamMessage(body: string, memberId?: string) {
  const response = await fetch("/api/virtual-team/message", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ body, member_id: memberId }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Virtual Team could not respond.");
  return data as {
    conversation_id: string;
    messages: Message[];
    mission_id?: string;
    proposal?: {
      display_name: string;
      member_key: string;
      job_title: string;
      role_description: string;
      gender: string;
      personality: string;
      communication_style: string;
    };
  };
}

/** Admin only. Removes one message from the database. */
export async function deleteVirtualTeamMessage(messageId: string) {
  const { error } = await getSupabase().rpc("virtual_team_delete_message", { p_message_id: messageId });
  if (error) throw error;
}

/** Admin only. Removes every message in a chat and keeps the chat. Returns the number removed. */
export async function clearVirtualTeamChat(conversationId: string) {
  const { data, error } = await getSupabase().rpc("virtual_team_clear_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return Number(data) || 0;
}

/** Admin only. Deletes one direct chat and its messages. The team chat cannot be deleted. Missions are kept. */
export async function deleteVirtualTeamChat(conversationId: string) {
  const { data, error } = await getSupabase().rpc("virtual_team_delete_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return Number(data) || 0;
}

/** Admin only. Adds a short system notice to the team chat, such as a new colleague joining. */
export async function postVirtualTeamNotice(body: string) {
  const { error } = await getSupabase().rpc("virtual_team_post_notice", { p_body: body });
  if (error) throw error;
}

export async function fetchMissions(): Promise<Mission[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_missions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Mission[];
}

export async function fetchMissionDetail(missionId: string) {
  const supabase = getSupabase();
  const [tasks, deliverables] = await Promise.all([
    supabase.from("virtual_team_tasks").select("*").eq("mission_id", missionId).order("position", { ascending: true }),
    supabase.from("virtual_team_deliverables").select("*").eq("mission_id", missionId).order("created_at", { ascending: true }),
  ]);
  if (tasks.error) throw tasks.error;
  if (deliverables.error) throw deliverables.error;
  return { tasks: (tasks.data ?? []) as Task[], deliverables: (deliverables.data ?? []) as Deliverable[] };
}

export async function reviewMission(missionId: string, action: "approve" | "pause" | "resume" | "cancel") {
  const { data, error } = await getSupabase().rpc("virtual_team_review_mission", {
    p_mission_id: missionId,
    p_action: action,
  });
  if (error) throw error;
  return String(data);
}

/** Admin only, audited. The only way to change the mode. */
export async function setOperatingMode(mode: OperatingMode) {
  const { data, error } = await getSupabase().rpc("virtual_team_set_mode", { p_mode: mode });
  if (error) throw error;
  return String(data);
}

/** Admin only. Budgets and background switches; the mode has its own audited call. */
export async function saveSettings(patch: Partial<Omit<Settings, "operating_mode">>) {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("virtual_team_settings")
    .update({ ...patch, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("organization_id", await currentOrganizationId());
  if (error) throw error;
}

async function currentOrganizationId(): Promise<string> {
  const { data, error } = await getSupabase().rpc("current_organization_id");
  if (error) throw error;
  if (!data) throw new Error("Complete company registration first.");
  return String(data);
}

export async function saveMember(
  input: Omit<Member, "id" | "is_manager" | "created_at" | "active"> & { id?: string; active?: boolean },
) {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const payload = {
    display_name: input.display_name.trim(),
    job_title: input.job_title.trim(),
    role_description: input.role_description.trim(),
    gender: input.gender,
    personality: input.personality.trim(),
    communication_style: input.communication_style.trim(),
    skills: input.skills,
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase.from("virtual_team_members").update(payload).eq("id", input.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("virtual_team_members").insert({
    ...payload,
    member_key: input.member_key,
    is_manager: false,
    created_by: userData.user?.id ?? null,
  });
  if (error) throw error;
}

/**
 * Deactivates or reactivates an employee. Employees are never deleted from the app: deleting one would
 * also delete their direct chat, and their past work stays in the record.
 */
export async function setMemberActive(memberId: string, active: boolean) {
  const { error } = await getSupabase()
    .from("virtual_team_members")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("is_manager", false);
  if (error) throw error;
}

export async function fetchPrompts(): Promise<Prompt[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_prompts")
    .select("*")
    .order("niche", { ascending: true })
    .order("category", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Prompt[];
}

export async function fetchPromptVersions(promptId: string): Promise<PromptVersion[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_prompt_versions")
    .select("*")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromptVersion[];
}

/** Saves an edit. The previous text is kept as a version. Approved prompts return to draft. */
export async function savePromptVersion(promptId: string, title: string, body: string, reason: string) {
  const { data, error } = await getSupabase().rpc("virtual_team_save_prompt", {
    p_prompt_id: promptId,
    p_title: title,
    p_body: body,
    p_reason: reason,
  });
  if (error) throw error;
  return Number(data);
}

/** Restores an earlier version as a new version, so nothing in the history is lost. */
export async function restorePromptVersion(promptId: string, version: number) {
  const { data, error } = await getSupabase().rpc("virtual_team_restore_prompt_version", {
    p_prompt_id: promptId,
    p_version: version,
  });
  if (error) throw error;
  return Number(data);
}

export async function setPromptStatus(promptId: string, status: Prompt["status"]) {
  const { error } = await getSupabase().rpc("virtual_team_set_prompt_status", {
    p_prompt_id: promptId,
    p_status: status,
  });
  if (error) throw error;
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await getSupabase()
    .from("virtual_team_audit_logs")
    .select("id, action, target_type, target_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}

/** Today's token use for the company, on the business calendar (India Standard Time). */
export async function fetchTodayUsage() {
  const { data, error } = await getSupabase()
    .from("virtual_team_usage")
    .select("tokens")
    .eq("usage_day", businessDateISO())
    .maybeSingle();
  if (error) throw error;
  return Number(data?.tokens) || 0;
}

/** The Business Analyst's figures: calculated in the browser from the same records the workers read. */
export async function fetchFinanceSummary(): Promise<FinanceSummary> {
  const [payments, expenses, tasks, documents, projects] = await Promise.all([
    fetchAll("Payment"),
    fetchAll("Expense"),
    fetchAll("Task"),
    fetchAll("Document"),
    fetchAll("Project"),
  ]);
  return summarizeFinance({
    payments,
    expenses,
    tasks,
    documents,
    projects,
    today: businessDateISO(),
  });
}
