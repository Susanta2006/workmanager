import { getAnonServerSupabase, getServiceSupabase } from "@/lib/supabase.server";

/**
 * Server-side sign-in verification for the standalone edition (one company per installation).
 * Every check returns null on failure. The reason is written to the server log only, so the
 * cause shows in the terminal (dev) or the hosting function logs. Tokens and keys are never logged.
 */

export type SessionIdentity = {
  organizationId: string | null;
  id: string;
  email: string;
  name: string;
  role: "admin" | "leader" | "member";
  accountStatus: "pending" | "approved";
  teamStatus: "active" | "inactive";
  sessionId: string;
  authTime: number;
  isGoogleUser: boolean;
};

export type SessionUser = Pick<SessionIdentity, "organizationId" | "id" | "email" | "name" | "role">;

type TokenClaims = {
  session_id?: string;
  auth_time?: number;
  iat?: number;
  amr?: Array<{ timestamp?: number }>;
};

type FailureReason =
  | "no-bearer-token"
  | "token-rejected-by-supabase"
  | "token-claims-unreadable"
  | "token-missing-session-id"
  | "token-missing-auth-time"
  | "profile-query-failed"
  | "profile-missing"
  | "google-account-unconfirmed"
  | "account-not-approved"
  | "team-inactive"
  | "no-organization"
  | "passcode-query-failed"
  | "passcode-session-missing";

function fail(reason: FailureReason, detail?: unknown): null {
  console.warn(`[auth] ${reason}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return null;
}

/** Reads "Bearer <token>" from the Authorization header, tolerating extra spaces and casing. */
export function getBearerToken(request: Request): string {
  const header = (request.headers.get("authorization") ?? "").trim();
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : "";
}

/** Decodes the JWT payload without verifying it. Verification happens in getUser() below. */
function decodeClaims(token: string): TokenClaims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenClaims;
  } catch {
    return null;
  }
}

/** Verifies the bearer token and that the caller is a confirmed Google account with a profile. */
export async function verifyRequestIdentity(request: Request): Promise<SessionIdentity | null> {
  const token = getBearerToken(request);
  if (!token) return fail("no-bearer-token");

  // Supabase confirms the token is genuine and not revoked.
  const { data, error } = await getAnonServerSupabase().auth.getUser(token);
  if (error || !data.user) return fail("token-rejected-by-supabase", error?.message ?? null);

  const claims = decodeClaims(token);
  if (!claims) return fail("token-claims-unreadable");
  // The session id ties this token to its passcode check, so it is required.
  if (!claims.session_id) return fail("token-missing-session-id");

  // Supabase records the sign-in time in amr[].timestamp (and iat). auth_time is optional.
  const amrTimes = (claims.amr ?? []).map((method) => Number(method.timestamp) || 0);
  const authTime = claims.auth_time ?? (Math.max(0, ...amrTimes) || claims.iat);
  if (!authTime) return fail("token-missing-auth-time");

  const { data: profile, error: profileError } = await getServiceSupabase()
    .from("profiles")
    .select("organization_id, role, account_status, team_status, full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) return fail("profile-query-failed", profileError.message);
  if (!profile) return fail("profile-missing");

  const providers: string[] = data.user.app_metadata?.providers || [];
  const isGoogleUser =
    (providers.includes("google") || data.user.app_metadata?.provider === "google") &&
    Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
  if (!isGoogleUser) return fail("google-account-unconfirmed");

  return {
    organizationId: profile.organization_id,
    id: data.user.id,
    email: data.user.email ?? "",
    name: profile.full_name || "",
    role: profile.role,
    accountStatus: profile.account_status,
    teamStatus: profile.team_status,
    sessionId: claims.session_id,
    authTime,
    isGoogleUser,
  };
}

/** Verifies an approved, active identity and the passcode check for this exact session. */
export async function verifyRequestUser(request: Request): Promise<SessionUser | null> {
  const identity = await verifyRequestIdentity(request);
  if (!identity) return null;
  if (!identity.organizationId) return fail("no-organization", identity.id);
  if (identity.accountStatus !== "approved") return fail("account-not-approved");
  if (identity.teamStatus !== "active") return fail("team-inactive");

  const { data, error } = await getServiceSupabase()
    .from("auth_passcode_sessions")
    .select("session_id")
    .eq("user_id", identity.id)
    .eq("session_id", identity.sessionId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) return fail("passcode-query-failed", error.message);
  if (!data) return fail("passcode-session-missing");

  return {
    organizationId: identity.organizationId,
    id: identity.id,
    email: identity.email,
    name: identity.name,
    role: identity.role,
  };
}
