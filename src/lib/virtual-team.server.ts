import { verifyRequestUser, getBearerToken } from "@/lib/auth.server";
import { getServiceSupabase, getUserScopedSupabase } from "@/lib/supabase.server";
import { serverEnv } from "@/lib/env";
import { summarizeFinance } from "@/lib/virtual-team-finance";

// Virtual Team: server-only. Every AI call happens here so the Gemini key never reaches the browser.
// Writes use the service role after the caller has been verified. Access rules are enforced again
// by row-level security for every browser read.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MAX_MESSAGE = 4000;
const MAX_ASSIGNMENTS = 4;
const PLAN_MAX_TOKENS = 900;
const REPLY_MAX_TOKENS = 700;
const TASK_MAX_TOKENS = 1200;
const REVIEW_MAX_TOKENS = 700;
const REPORT_MAX_TOKENS = 900;
const SEARCH_MAX_TOKENS = 1200;
// Employees allowed to research the web and Google Maps. Everyone else works from what the Admin supplied.
const RESEARCH_KEYS = new Set(["local-scout"]);
// Only an explicit request from the Admin triggers a written briefing.
const REPORT_REQUEST = /\b(report|summary|summari[sz]e|briefing|brief me)\b/i;
const TICK_TASK_LIMIT = 2;
const TICK_BUDGET_MS = 35_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const DEFAULT_SETTINGS = {
  operating_mode: "team" as "solo" | "team",
  background_enabled: true,
  max_concurrent_missions: 3,
  mission_token_budget: 8000,
  daily_token_limit: 200000,
};

type MemberRow = {
  id: string;
  member_key: string;
  display_name: string;
  job_title: string;
  role_description: string;
  gender: string;
  personality: string;
  communication_style: string;
  is_manager: boolean;
  active: boolean;
};

type SettingsRow = typeof DEFAULT_SETTINGS;

type TaskRow = {
  id: string;
  organization_id: string;
  mission_id: string;
  member_id: string | null;
  position: number;
  instruction: string;
  attempts: number;
  max_attempts: number;
};

type MissionRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  title: string;
  request: string;
  status: string;
  token_budget: number;
  tokens_used: number;
  created_at: string;
};

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };
type HistoryLine = { speaker: string; body: string };

class ModelError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value: unknown, max: number) => String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
const todayISO = () => new Date().toISOString().slice(0, 10);

function parseJson(text: string): any | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Calls Gemini through its OpenAI-compatible endpoint. Retries short overloads with a growing pause. */
async function callModel(messages: ChatTurn[], options: { maxTokens: number; json?: boolean }) {
  const apiKey = serverEnv("GEMINI_API_KEY");
  const model = serverEnv("GEMINI_MODEL");
  if (!apiKey || !model) throw new ModelError("Gemini is not configured on the server.", 503, null);

  const payload: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens,
    temperature: 0.6,
  };
  if (options.json) payload.response_format = { type: "json_object" };

  let lastError: ModelError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result: any = await response.json().catch(() => ({}));
    if (response.ok) {
      return {
        text: String(result?.choices?.[0]?.message?.content ?? "").trim(),
        tokens: Number(result?.usage?.total_tokens) || 0,
      };
    }
    const retryAfter = Number(response.headers.get("retry-after")) || null;
    lastError = new ModelError(
      result?.error?.message || `Gemini request failed (${response.status}).`,
      response.status,
      retryAfter,
    );
    if (!RETRYABLE.has(response.status)) break;
  }
  throw lastError ?? new ModelError("Gemini request failed.", 502, null);
}

// ===== Data loaders =====

async function loadSettings(admin: any, organizationId: string): Promise<SettingsRow> {
  const { data } = await admin
    .from("virtual_team_settings")
    .select("operating_mode, background_enabled, max_concurrent_missions, mission_token_budget, daily_token_limit")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

async function loadMembers(admin: any, organizationId: string): Promise<MemberRow[]> {
  const { data, error } = await admin
    .from("virtual_team_members")
    .select("id, member_key, display_name, job_title, role_description, gender, personality, communication_style, is_manager, active")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

async function loadGroupId(admin: any, organizationId: string): Promise<string | null> {
  const { data } = await admin
    .from("virtual_team_conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kind", "group")
    .maybeSingle();
  return data?.id ?? null;
}

async function ensureDirect(admin: any, organizationId: string, memberId: string): Promise<string> {
  const find = () =>
    admin
      .from("virtual_team_conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "direct")
      .eq("member_id", memberId)
      .maybeSingle();
  const existing = await find();
  if (existing.data?.id) return existing.data.id;
  const { error } = await admin
    .from("virtual_team_conversations")
    .insert({ organization_id: organizationId, kind: "direct", member_id: memberId, title: "" });
  if (error && error.code !== "23505") throw error;
  const created = await find();
  if (!created.data?.id) throw new Error("Could not open the direct chat.");
  return created.data.id;
}

async function loadHistory(admin: any, conversationId: string, members: MemberRow[], limit = 20): Promise<HistoryLine[]> {
  const { data, error } = await admin
    .from("virtual_team_messages")
    .select("sender_kind, sender_member_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const byId = new Map(members.map((member) => [member.id, member]));
  return (data ?? []).reverse().map((row: any) => {
    const speaker =
      row.sender_kind === "admin"
        ? "Admin"
        : row.sender_kind === "member"
          ? "Team member"
          : row.sender_kind === "system"
            ? "System"
            : byId.get(row.sender_member_id)?.display_name ?? "Manager AI";
    return { speaker, body: row.body };
  });
}

async function postMessage(
  admin: any,
  row: {
    organization_id: string;
    conversation_id: string;
    sender_kind: "admin" | "member" | "manager" | "system";
    sender_member_id?: string | null;
    sender_user_id?: string | null;
    body: string;
    mission_id?: string | null;
  },
) {
  const body = clean(row.body, 7900) || "(no response)";
  const { data, error } = await admin
    .from("virtual_team_messages")
    .insert({ ...row, body })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function todayUsage(admin: any, organizationId: string): Promise<number> {
  const { data } = await admin
    .from("virtual_team_usage")
    .select("tokens")
    .eq("organization_id", organizationId)
    .eq("usage_day", todayISO())
    .maybeSingle();
  return Number(data?.tokens) || 0;
}

async function addUsage(admin: any, organizationId: string, tokens: number) {
  if (!tokens) return;
  const total = (await todayUsage(admin, organizationId)) + tokens;
  const { error } = await admin
    .from("virtual_team_usage")
    .upsert(
      { organization_id: organizationId, usage_day: todayISO(), tokens: total },
      { onConflict: "organization_id,usage_day" },
    );
  if (error) throw error;
}

async function addMissionTokens(admin: any, mission: MissionRow, tokens: number) {
  if (!tokens) return;
  const { error } = await admin
    .from("virtual_team_missions")
    .update({ tokens_used: mission.tokens_used + tokens, updated_at: new Date().toISOString() })
    .eq("id", mission.id);
  if (error) throw error;
  mission.tokens_used += tokens;
}

// ===== Personas and prompts =====

function personaPrompt(member: MemberRow, roster: MemberRow[]) {
  const colleagues = roster
    .filter((item) => item.id !== member.id && !item.is_manager)
    .map((item) => `${item.display_name} (${item.job_title})`)
    .join(", ");
  return `You are ${member.display_name}, ${member.job_title} at Shristi AI Web Creations, working in the company's Virtual Team for the Admin (the owner).
Your role: ${member.role_description}
Personality: ${member.personality || "Professional and clear."}
Communication style: ${member.communication_style || "Concise."}
Colleagues: ${colleagues || "none listed"}.
Rules:
- Stay in character. Reply in the first person, in plain text, normally under 250 words.
- Use only facts from the conversation or figures supplied to you. Never invent names, phone numbers, emails, websites, ratings, prices, audit results or financial records. Say "unknown" when something is missing.
- Separate verified facts from inference. If information is missing, ask the Admin one direct question.
- If you disagree with a colleague or the plan, say so respectfully and give your evidence. Do not disagree just to disagree.
- You produce written work and documents. The Admin downloads them as Word, PDF, CSV or Markdown from the mission deliverables. Never say you sent emails, contacted anyone, published anything or ran tests you did not run.
- You have no internet, maps, business directory or search access. Never list businesses, phone numbers, review counts, ratings, websites or links unless the Admin supplied them in this conversation. If asked to find leads, say you cannot search, and ask the Admin to supply the list or a source.
- Do not write a report, summary or briefing unless the Admin asks for one. Keep your reply to your assigned work.`;
}

function transcript(history: HistoryLine[]) {
  return `Conversation so far (most recent last):\n${history.map((line) => `${line.speaker}: ${line.body}`).join("\n")}`;
}

// ===== Manager planning (one call decides chat, mission or employee proposal) =====

type Plan = {
  intent: "chat" | "mission" | "add_employee";
  reply: string;
  mission_title: string;
  assignments: { member_key: string; instruction: string }[];
  employee: Record<string, unknown> | null;
};

async function planWithManager(roster: MemberRow[], history: HistoryLine[], canCommand: boolean): Promise<Plan & { tokens: number }> {
  const members = roster
    .filter((member) => !member.is_manager && member.active)
    .map((member) => `- ${member.member_key}: ${member.display_name}, ${member.job_title}. ${member.role_description}`)
    .join("\n");
  const system = `You are Manager AI, the Virtual CEO of Shristi AI Web Creations. You coordinate the employees for the Admin (the owner).
Roster (use member_key exactly):
${members}

Choose one intent:
- "chat": questions, greetings, status questions or conversation. Answer directly in "reply".
- "mission": the Admin asks for work that needs one or more employees. Give 1 to ${MAX_ASSIGNMENTS} assignments, each with the fewest employees needed and a specific instruction. Give a short mission_title.
- "add_employee": the Admin asks to add a colleague. Fill "employee" with display_name, job_title, gender (male, female or neutral), role_description and personality. In "reply" say the Admin must confirm.

Rules: never invent facts, figures, contacts or results. Do not say work is finished when it has only been assigned. If essential information is missing, ask one clear question and use intent "chat". ${canCommand ? "" : "The sender cannot start missions, so use intent \"chat\"."}

Return ONLY a JSON object: {"intent": "chat|mission|add_employee", "reply": "...", "mission_title": "...", "assignments": [{"member_key": "...", "instruction": "..."}], "employee": {"display_name": "", "job_title": "", "gender": "", "role_description": "", "personality": ""}}`;

  const result = await callModel(
    [
      { role: "system", content: system },
      { role: "user", content: transcript(history) },
    ],
    { maxTokens: PLAN_MAX_TOKENS, json: true },
  );
  const parsed = parseJson(result.text) ?? {};
  const intent = ["chat", "mission", "add_employee"].includes(parsed.intent) ? parsed.intent : "chat";
  const assignments = Array.isArray(parsed.assignments)
    ? parsed.assignments
        .map((item: any) => ({
          member_key: clean(item?.member_key, 40),
          instruction: clean(item?.instruction, 4000),
        }))
        .filter((item: { member_key: string; instruction: string }) => item.member_key && item.instruction)
    : [];
  return {
    intent: intent === "mission" && !canCommand ? "chat" : intent,
    reply: clean(parsed.reply, 2000) || clean(result.text, 2000) || "Understood. Could you tell me a little more?",
    mission_title: clean(parsed.mission_title, 160),
    assignments,
    employee: parsed.employee && typeof parsed.employee === "object" ? parsed.employee : null,
    tokens: result.tokens,
  };
}

function normaliseEmployee(raw: Record<string, unknown>) {
  const displayName = clean(raw.display_name, 60);
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const gender = ["male", "female", "neutral"].includes(String(raw.gender)) ? String(raw.gender) : "neutral";
  return {
    display_name: displayName,
    member_key: slug.length >= 2 ? slug : `employee-${Date.now().toString(36)}`,
    job_title: clean(raw.job_title, 120),
    role_description: clean(raw.role_description, 2000),
    gender,
    personality: clean(raw.personality, 2000),
    communication_style: "",
  };
}

type PromptDraft = {
  niche: string;
  category: string;
  title: string;
  body: string;
  intended_use: string;
  variables: string[];
  tags: string[];
};

/** Splits the Prompt Engineer's reply into readable text and the prompts to save in the library. */
function extractPromptBlock(output: string): { body: string; prompts: PromptDraft[] } {
  const match = /```json\s*([\s\S]*?)```/i.exec(output);
  if (!match) return { body: output, prompts: [] };
  const body = output.replace(match[0], "").trim();
  const parsed = parseJson(match[1]);
  const list = Array.isArray(parsed) ? parsed : [];
  const strings = (value: unknown, limit: number, max: number) =>
    Array.isArray(value) ? value.map((item) => clean(item, max)).filter(Boolean).slice(0, limit) : [];
  const prompts = list
    .slice(0, 30)
    .map((item: any) => ({
      niche: clean(item?.niche, 120),
      category: clean(item?.category, 120),
      title: clean(item?.title, 200),
      body: clean(item?.body, 50000),
      intended_use: clean(item?.intended_use, 1000),
      variables: strings(item?.variables, 30, 60),
      tags: strings(item?.tags, 15, 40),
    }))
    .filter((item: PromptDraft) => item.niche && item.category && item.title && item.body);
  return { body: body || "Prompts were saved to the Prompt Library.", prompts };
}

// ===== Company figures for the Business Analyst (real records only) =====

async function fetchEntity(admin: any, organizationId: string, entity: string) {
  const rows: any[] = [];
  for (let from = 0; rows.length < 100_000; from += 1000) {
    const { data, error } = await admin
      .from("records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("entity", entity)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []).map((row: any) => row.data ?? {}));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function financeBlock(admin: any, organizationId: string) {
  const [payments, expenses, tasks] = await Promise.all([
    fetchEntity(admin, organizationId, "Payment"),
    fetchEntity(admin, organizationId, "Expense"),
    fetchEntity(admin, organizationId, "Task"),
  ]);
  const summary = summarizeFinance({ payments, expenses, tasks, today: todayISO() });
  return `Company figures from the records (calculated, not estimated):\n${JSON.stringify(summary, null, 2)}`;
}

// ===== Message endpoint: the Admin or a member talks to Manager AI or an employee =====

/**
 * Reads the city from the Manager's instruction first, then the Admin's request ("... in Agartala ...").
 * Returns null when no area is named, so the employee asks instead of guessing.
 */
const AREA_STOPWORDS = new Set(["with", "and", "that", "who", "which", "where", "having", "for", "from", "tell", "give", "only", "no", "all", "the", "overall", "our", "my", "please", "to", "of", "on", "show", "list"]);
function researchArea(...texts: string[]): string | null {
  for (const text of texts) {
    const match = String(text ?? "").match(/\bin\s+([A-Za-z]{3,}(?:\s+[A-Za-z]{3,}){0,2})/i);
    if (!match) continue;
    const words: string[] = [];
    for (const word of match[1].split(/\s+/)) {
      if (AREA_STOPWORDS.has(word.toLowerCase())) break;
      words.push(word);
    }
    if (words.length) return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  }
  return null;
}

type WebSource = { title: string; uri: string };
type MapPlace = { name: string; address: string; phone: string; rating: string; reviews: string; website: string; mapsUri: string };

/** Google Search grounding through the native Gemini API. Returns the answer and the pages it used. */
async function webSearch(query: string): Promise<{ text: string; sources: WebSource[]; tokens: number }> {
  const apiKey = serverEnv("GEMINI_API_KEY");
  const model = serverEnv("GEMINI_MODEL");
  if (!apiKey || !model) throw new ModelError("Gemini is not configured on the server.", 503, null);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: SEARCH_MAX_TOKENS, temperature: 0.2 },
    }),
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new ModelError(result?.error?.message || `Web search failed (${response.status}).`, response.status, null);
  const candidate = result?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part: any) => part?.text ?? "").join("").trim();
  const sources: WebSource[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk: any) => ({ title: clean(chunk?.web?.title, 200), uri: clean(chunk?.web?.uri, 500) }))
    .filter((item: WebSource) => item.uri);
  return { text, sources, tokens: Number(result?.usageMetadata?.totalTokenCount) || 0 };
}

/**
 * Free business records from OpenStreetMap (Overpass API). No key or billing.
 * Data is community-maintained: a missing phone or website means "not recorded", not "does not exist".
 * It has no ratings or review counts, so those must come from web pages that state them.
 */
async function mapsSearch(areaName: string): Promise<{ places: MapPlace[]; error: string | null }> {
  const contact = serverEnv("RESEARCH_CONTACT_EMAIL");
  const userAgent = `WorkManager-VirtualTeam/1.0${contact ? ` (${contact})` : ""}`;
  const area = clean(areaName, 60).replace(/["\\]/g, "") || "Agartala";
  const query = `[out:json][timeout:25];
area["name"="${area}"]["boundary"="administrative"]->.a;
(
  nwr["shop"](area.a);
  nwr["amenity"~"^(restaurant|cafe|fast_food|pharmacy|clinic|hospital|dentist|bar|bank)$"](area.a);
  nwr["craft"](area.a);
  nwr["office"](area.a);
);
out tags center 150;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": userAgent, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(30000),
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) return { places: [], error: `OpenStreetMap lookup failed (${response.status}).` };
    const places: MapPlace[] = (result?.elements ?? [])
      .filter((item: any) => item?.tags?.name)
      .map((item: any) => {
        const tags = item.tags;
        const kind = tags.shop || tags.amenity || tags.craft || tags.office || "business";
        const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]]
          .filter(Boolean)
          .map((part: unknown) => clean(part, 80))
          .join(", ");
        return {
          name: clean(tags.name, 200),
          address: clean(`${kind}${address ? `, ${address}` : ""}`, 300),
          phone: clean(tags.phone || tags["contact:phone"], 40),
          rating: "",
          reviews: "",
          website: clean(tags.website || tags["contact:website"], 300),
          mapsUri: `https://www.openstreetmap.org/${clean(item.type, 10)}/${Number(item.id) || 0}`,
        };
      });
    return { places, error: null };
  } catch (error) {
    return { places: [], error: `OpenStreetMap lookup unavailable: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

/** Builds the research material given to an employee. Only retrieved facts are included. */
async function researchBlock(area: string | null, instruction: string): Promise<{ block: string; tokens: number }> {
  if (!area) {
    return {
      block: "AREA NOT SPECIFIED: the Admin did not name a city or area for this search. Ask the Admin which area to search. Do not list any businesses.",
      tokens: 0,
    };
  }
  const lines: string[] = [];
  let tokens = 0;
  try {
    const web = await webSearch(`${instruction}\nArea: ${area}\n\nUse Google Search. List only real businesses you found, each with the page it came from.`);
    tokens += web.tokens;
    lines.push(
      "WEB SEARCH FINDINGS (leads to check, not verified facts):",
      web.text || "No web results.",
      "Pages used:",
      web.sources.length ? web.sources.map((source) => `- ${source.title || "untitled"} ${source.uri}`).join("\n") : "- none returned",
    );
  } catch (error) {
    lines.push(`WEB SEARCH unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const maps = await mapsSearch(area);
  if (maps.error) lines.push(maps.error);
  else if (!maps.places.length) lines.push("BUSINESS RECORDS: none returned for this area.");
  else {
    lines.push("BUSINESS RECORDS (OpenStreetMap, free community data; blank website or phone means not recorded. Ratings and review counts are not in this source):");
    maps.places.forEach((place, index) => {
      lines.push(
        `${index + 1}. ${place.name} | ${place.address} | phone: ${place.phone || "not recorded"} | website: ${place.website || "not recorded"} | record: ${place.mapsUri}`,
      );
    });
  }
  lines.push("RULES: Quote only what appears above. Write 'not recorded' for any missing field. Give a rating or review count only if a web page above states it, and name that page. Never create a business, phone number, rating, review count or link that is not in these results.");
  return { block: lines.join("\n"), tokens };
}

async function buildReport(admin: any, organizationId: string, members: MemberRow[], requestText: string): Promise<{ text: string; tokens: number }> {
  const { data: missions } = await admin
    .from("virtual_team_missions")
    .select("id,title,request,status,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(3);
  const list = missions ?? [];
  if (!list.length) return { text: "There are no missions yet, so there is nothing to report.", tokens: 0 };

  const { data: tasks } = await admin
    .from("virtual_team_tasks")
    .select("mission_id,position,member_id,status,output")
    .in("mission_id", list.map((item: any) => item.id))
    .order("position", { ascending: true });

  const records = list
    .map((item: any) => {
      const rows = (tasks ?? []).filter((task: any) => task.mission_id === item.id);
      const lines = rows
        .map((task: any) => {
          const name = members.find((member) => member.id === task.member_id)?.display_name ?? "Employee";
          return `${name} (${task.status}):\n${clean(task.output || "(no output yet)", 1500)}`;
        })
        .join("\n\n");
      return `Mission: ${item.title} [${item.status}]\nAdmin request: ${item.request}\n${lines}`;
    })
    .join("\n\n----\n\n");

  const briefing = await callModel(
    [
      {
        role: "system",
        content: "You are Manager AI briefing the Admin. Using only the mission records below, write a briefing: what was delivered, key findings, disagreements and how they were settled, open questions, and missing information. Name who said what. Do not add facts that are not in the records. Plain text, under 300 words.",
      },
      { role: "user", content: `Admin asked: ${requestText}\n\n${records}` },
    ],
    { maxTokens: REPORT_MAX_TOKENS },
  );
  return { text: clean(briefing.text, 4000) || "I could not prepare the briefing. Please try again.", tokens: briefing.tokens };
}

export async function handleVirtualTeamMessage(request: Request): Promise<Response> {
  const user = await verifyRequestUser(request);
  if (!user || !user.organizationId) return json({ error: "Unauthorized" }, 401);

  const body: any = await request.json().catch(() => null);
  const text = clean(body?.body, MAX_MESSAGE);
  if (!text) return json({ error: "Write a message first." }, 400);

  const scoped = getUserScopedSupabase(getBearerToken(request));
  const { error: bootError } = await scoped.rpc("virtual_team_bootstrap");
  if (bootError) return json({ error: "Virtual Team could not open for your account." }, 403);

  const admin = getServiceSupabase();
  const organizationId = user.organizationId;
  const [settings, members] = await Promise.all([
    loadSettings(admin, organizationId),
    loadMembers(admin, organizationId),
  ]);
  if (await todayUsage(admin, organizationId) >= settings.daily_token_limit) {
    return json({ error: "The daily AI limit has been reached. It resets tomorrow, or the Admin can raise it in Settings." }, 429);
  }

  const isAdmin = user.role === "admin";
  const canCommand = user.role === "admin" || user.role === "leader";
  const manager = members.find((member) => member.is_manager);
  const roster = members.filter((member) => member.active);
  const senderBase = {
    organization_id: organizationId,
    sender_kind: (isAdmin ? "admin" : "member") as "admin" | "member",
    sender_user_id: user.id,
  };

  // Direct chat with one employee.
  const directId = typeof body?.member_id === "string" ? body.member_id : "";
  if (directId) {
    const target = members.find((member) => member.id === directId && !member.is_manager && member.active);
    if (!target) return json({ error: "That employee is not available." }, 404);
    const conversationId = await ensureDirect(admin, organizationId, target.id);
    const userMessage = await postMessage(admin, { ...senderBase, conversation_id: conversationId, body: text });
    const history = await loadHistory(admin, conversationId, members);
    const answer = await callModel(
      [
        { role: "system", content: personaPrompt(target, roster) },
        { role: "user", content: transcript(history) },
      ],
      { maxTokens: REPLY_MAX_TOKENS },
    );
    await addUsage(admin, organizationId, answer.tokens);
    const reply = await postMessage(admin, {
      organization_id: organizationId,
      conversation_id: conversationId,
      sender_kind: "member",
      sender_member_id: target.id,
      body: answer.text,
    });
    return json({ conversation_id: conversationId, messages: [userMessage, reply] });
  }

  // Team chat.
  const groupId = await loadGroupId(admin, organizationId);
  if (!groupId) return json({ error: "The team chat could not be opened." }, 500);
  const userMessage = await postMessage(admin, { ...senderBase, conversation_id: groupId, body: text });

  // Employees mentioned by name answer in the team chat themselves.
  const lower = text.toLowerCase();
  const mentioned = roster
    .filter((member) => !member.is_manager && (lower.includes(`@${member.display_name.toLowerCase()}`) || lower.includes(`@${member.member_key}`)))
    .slice(0, 2);
  if (mentioned.length) {
    const replies = [];
    for (const target of mentioned) {
      const history = await loadHistory(admin, groupId, members);
      const answer = await callModel(
        [
          { role: "system", content: personaPrompt(target, roster) },
          { role: "user", content: transcript(history) },
        ],
        { maxTokens: REPLY_MAX_TOKENS },
      );
      await addUsage(admin, organizationId, answer.tokens);
      replies.push(
        await postMessage(admin, {
          organization_id: organizationId,
          conversation_id: groupId,
          sender_kind: "member",
          sender_member_id: target.id,
          body: answer.text,
        }),
      );
    }
    return json({ conversation_id: groupId, messages: [userMessage, ...replies] });
  }

  // Admin asks for a report: Manager AI briefs from the stored mission records.
  if (isAdmin && REPORT_REQUEST.test(text)) {
    const briefing = await buildReport(admin, organizationId, members, text);
    await addUsage(admin, organizationId, briefing.tokens);
    const managerMessage = await postMessage(admin, {
      organization_id: organizationId,
      conversation_id: groupId,
      sender_kind: "manager",
      sender_member_id: manager?.id ?? null,
      body: briefing.text,
    });
    return json({ conversation_id: groupId, messages: [userMessage, managerMessage] });
  }

  // Otherwise Manager AI decides how to respond.
  const history = await loadHistory(admin, groupId, members, 12);
  const plan = await planWithManager(members, history, canCommand);
  await addUsage(admin, organizationId, plan.tokens);
  const managerId = manager?.id ?? null;

  if (plan.intent === "mission") {
    const assignments = plan.assignments
      .map((item) => ({ ...item, member: roster.find((member) => member.member_key === item.member_key && !member.is_manager) }))
      .filter((item) => item.member)
      .slice(0, MAX_ASSIGNMENTS);
    if (assignments.length) {
      const status = isAdmin ? "queued" : "awaiting_approval";
      const { data: mission, error: missionError } = await admin
        .from("virtual_team_missions")
        .insert({
          organization_id: organizationId,
          conversation_id: groupId,
          title: plan.mission_title || text.slice(0, 120),
          request: text,
          status,
          origin: "admin",
          token_budget: settings.mission_token_budget,
          requested_by: user.id,
        })
        .select("*")
        .single();
      if (missionError) throw missionError;

      const { error: taskError } = await admin.from("virtual_team_tasks").insert(
        assignments.map((item, index) => ({
          organization_id: organizationId,
          mission_id: mission.id,
          member_id: item.member!.id,
          position: index + 1,
          instruction: item.instruction,
        })),
      );
      if (taskError) throw taskError;

      const names = assignments.map((item) => item.member!.display_name).join(", ");
      const statusLine =
        status === "queued"
          ? `Mission started: ${mission.title}. Assigned to ${names}. Each will reply here when finished. Ask for a report whenever you want one.`
          : `Mission waiting for Admin approval: ${mission.title}. Proposed for ${names}.`;
      const managerMessage = await postMessage(admin, {
        organization_id: organizationId,
        conversation_id: groupId,
        sender_kind: "manager",
        sender_member_id: managerId,
        body: `${plan.reply}\n\n${statusLine}`,
        mission_id: mission.id,
      });
      return json({ conversation_id: groupId, messages: [userMessage, managerMessage], mission_id: mission.id });
    }
  }

  if (plan.intent === "add_employee" && isAdmin && plan.employee) {
    const proposal = normaliseEmployee(plan.employee);
    if (proposal.display_name) {
      const managerMessage = await postMessage(admin, {
        organization_id: organizationId,
        conversation_id: groupId,
        sender_kind: "manager",
        sender_member_id: managerId,
        body: plan.reply,
      });
      return json({ conversation_id: groupId, messages: [userMessage, managerMessage], proposal });
    }
  }

  const managerMessage = await postMessage(admin, {
    organization_id: organizationId,
    conversation_id: groupId,
    sender_kind: "manager",
    sender_member_id: managerId,
    body: plan.reply,
  });
  return json({ conversation_id: groupId, messages: [userMessage, managerMessage] });
}

// ===== Background worker: runs queued tasks one at a time, per mission =====

async function releaseTask(admin: any, task: TaskRow, delaySeconds: number, reason: string, countAttempt: boolean) {
  const { error } = await admin
    .from("virtual_team_tasks")
    .update({
      status: "queued",
      attempts: countAttempt ? task.attempts : Math.max(task.attempts - 1, 0),
      next_run_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      claimed_at: null,
      last_error: clean(reason, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id);
  if (error) throw error;
}

async function failMission(admin: any, mission: MissionRow, reason: string) {
  await admin
    .from("virtual_team_tasks")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("mission_id", mission.id)
    .in("status", ["queued", "running"]);
  await admin
    .from("virtual_team_missions")
    .update({ status: "failed", error: clean(reason, 500), updated_at: new Date().toISOString() })
    .eq("id", mission.id);
  await postMessage(admin, {
    organization_id: mission.organization_id,
    conversation_id: mission.conversation_id,
    sender_kind: "system",
    body: `Mission stopped: ${mission.title}. ${reason}`,
    mission_id: mission.id,
  });
}

async function finishMissionIfDone(admin: any, missionId: string) {
  const { count } = await admin
    .from("virtual_team_tasks")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)
    .in("status", ["queued", "running"]);
  if ((count ?? 0) > 0) return;

  const { data: mission } = await admin.from("virtual_team_missions").select("*").eq("id", missionId).maybeSingle();
  if (!mission || mission.status !== "running") return;

  // Nothing is posted to the chat here. The Admin requests reports explicitly.
  await admin
    .from("virtual_team_missions")
    .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", missionId);
  await admin.from("virtual_team_audit_logs").insert({
    organization_id: mission.organization_id,
    action: "mission.completed",
    target_type: "mission",
    target_id: missionId,
    detail: {},
  });
}

async function processTask(admin: any, task: TaskRow) {
  const { data: mission } = await admin.from("virtual_team_missions").select("*").eq("id", task.mission_id).maybeSingle();
  if (!mission) {
    await admin.from("virtual_team_tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", task.id);
    return;
  }
  if (mission.status === "cancelled") {
    await admin.from("virtual_team_tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", task.id);
    return;
  }
  if (mission.status === "paused") {
    await releaseTask(admin, task, 300, "Mission is paused.", false);
    return;
  }

  const settings = await loadSettings(admin, mission.organization_id);
  if (!settings.background_enabled) {
    await releaseTask(admin, task, 900, "Background work is switched off in Settings.", false);
    return;
  }
  if (await todayUsage(admin, mission.organization_id) >= settings.daily_token_limit) {
    await releaseTask(admin, task, 3600, "Daily AI limit reached. Work resumes when the limit resets or is raised.", false);
    return;
  }
  if (mission.tokens_used >= mission.token_budget) {
    await admin.from("virtual_team_tasks").update({ status: "failed", last_error: "Token budget reached." }).eq("id", task.id);
    await failMission(admin, mission, "The mission token budget has been used up. Raise the budget or start a narrower mission.");
    return;
  }

  if (mission.status === "queued") {
    const { count } = await admin
      .from("virtual_team_missions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", mission.organization_id)
      .eq("status", "running");
    if ((count ?? 0) >= settings.max_concurrent_missions) {
      await releaseTask(admin, task, 120, "Waiting for a free mission slot.", false);
      return;
    }
    await admin
      .from("virtual_team_missions")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", mission.id)
      .eq("status", "queued");
  }

  const members = await loadMembers(admin, mission.organization_id);
  const member = members.find((item) => item.id === task.member_id);
  if (!member) {
    await admin.from("virtual_team_tasks").update({ status: "failed", last_error: "Employee no longer exists." }).eq("id", task.id);
    await failMission(admin, mission as MissionRow, "An assigned employee no longer exists.");
    return;
  }

  try {
    const { data: prior } = await admin
      .from("virtual_team_tasks")
      .select("member_id, output")
      .eq("mission_id", mission.id)
      .eq("status", "done")
      .lt("position", task.position)
      .order("position", { ascending: true });
    const colleagueWork = (prior ?? [])
      .map((row: any) => {
        const name = members.find((item) => item.id === row.member_id)?.display_name ?? "Colleague";
        return `${name}:\n${clean(row.output, 2500)}`;
      })
      .join("\n\n");
    const figures = member.member_key === "business-analyst" ? await financeBlock(admin, mission.organization_id) : "";
    const research = RESEARCH_KEYS.has(member.member_key)
      ? await researchBlock(researchArea(task.instruction, mission.request), task.instruction)
      : null;
    if (research?.tokens) {
      await addMissionTokens(admin, mission as MissionRow, research.tokens);
      await addUsage(admin, mission.organization_id, research.tokens);
    }

    const wantsTable = /\b(csv|excel|xlsx|spreadsheet|table)\b/i.test(mission.request);
    const wantsDocument = /\b(pdf|docx|word|document|doc|report)\b/i.test(mission.request);
    const formatNote = wantsTable
      ? "Output format: include one markdown table with a header row and one row per record. Keep the same columns in every row, and write 'not recorded' for missing values."
      : wantsDocument
        ? "Output format: write a complete, well-structured document with clear headings, short paragraphs and bullet points, ready to export as PDF or Word."
        : "";

    const userContent = [
      `Mission: ${mission.title}`,
      `Admin request: ${mission.request}`,
      colleagueWork ? `Colleagues' completed work:\n${colleagueWork}` : "No colleague has finished earlier work on this mission yet.",
      figures,
      research?.block ?? "",
      formatNote,
      `Your instruction: ${task.instruction}`,
      member.member_key === "prompt-engineer"
        ? "If you create prompts for reuse, end your reply with one ```json block containing an array of objects with keys niche, category, title, intended_use, variables (array), tags (array) and body. Use {{placeholders}} for variables. Keep each prompt specific, actionable and reusable."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await callModel(
      [
        { role: "system", content: personaPrompt(member, members) },
        { role: "user", content: userContent },
      ],
      { maxTokens: TASK_MAX_TOKENS },
    );
    const rawOutput = clean(result.text, 20000) || "No output was produced for this instruction.";
    const { body: output, prompts } =
      member.member_key === "prompt-engineer"
        ? extractPromptBlock(rawOutput)
        : { body: rawOutput, prompts: [] as PromptDraft[] };

    await addMissionTokens(admin, mission as MissionRow, result.tokens);
    await addUsage(admin, mission.organization_id, result.tokens);
    await admin
      .from("virtual_team_tasks")
      .update({ status: "done", output, last_error: "", claimed_at: null, updated_at: new Date().toISOString() })
      .eq("id", task.id);
    await admin.from("virtual_team_deliverables").insert({
      organization_id: mission.organization_id,
      mission_id: mission.id,
      member_id: member.id,
      title: `${member.display_name}: ${clean(task.instruction, 120)}`,
      format: "md",
      content: output,
    });
    await postMessage(admin, {
      organization_id: mission.organization_id,
      conversation_id: mission.conversation_id,
      sender_kind: "member",
      sender_member_id: member.id,
      body: output,
      mission_id: mission.id,
    });
    if (prompts.length) {
      const { error: promptError } = await admin.from("virtual_team_prompts").insert(
        prompts.map((item) => ({
          ...item,
          organization_id: mission.organization_id,
          mission_id: mission.id,
          created_by_member_id: member.id,
          status: "draft",
          version: 1,
        })),
      );
      if (promptError) console.warn("[virtual-team] prompts not saved", promptError.message);
    }
    await finishMissionIfDone(admin, mission.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const retryAfter = error instanceof ModelError ? error.retryAfterSeconds : null;
    console.warn("[virtual-team] task failed", task.id, message);
    if (task.attempts < task.max_attempts) {
      await releaseTask(admin, task, retryAfter ?? 60 * task.attempts, message, true);
    } else {
      await admin
        .from("virtual_team_tasks")
        .update({ status: "failed", last_error: clean(message, 500), claimed_at: null, updated_at: new Date().toISOString() })
        .eq("id", task.id);
      await failMission(admin, mission as MissionRow, `${member.display_name} could not finish: ${message}`);
    }
  }
}

/** One worker pass. pg_cron calls this every minute through a secret-protected route. */
export async function runWorkerTick() {
  const admin = getServiceSupabase();
  await admin.rpc("virtual_team_recover_stuck");

  const started = Date.now();
  const { data, error } = await admin.rpc("virtual_team_claim_tasks", { p_limit: TICK_TASK_LIMIT });
  if (error) throw error;
  const tasks = (data ?? []) as TaskRow[];

  let processed = 0;
  for (const task of tasks) {
    if (Date.now() - started > TICK_BUDGET_MS) {
      await releaseTask(admin, task, 60, "Deferred to the next run.", false);
      continue;
    }
    await processTask(admin, task);
    processed += 1;
  }
  return { claimed: tasks.length, processed };
}

function sameSecret(provided: string, expected: string) {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function handleVirtualTeamWorker(request: Request): Promise<Response> {
  const expected = serverEnv("VIRTUAL_TEAM_WORKER_SECRET") ?? "";
  const provided = request.headers.get("x-worker-secret") ?? "";
  if (!expected || !sameSecret(provided, expected)) return json({ error: "Unauthorized" }, 401);
  try {
    const summary = await runWorkerTick();
    return json({ ok: true, ...summary });
  } catch (error) {
    console.error("[virtual-team] worker run failed", error instanceof Error ? error.message : error);
    return json({ error: "Worker run failed." }, 500);
  }
}
