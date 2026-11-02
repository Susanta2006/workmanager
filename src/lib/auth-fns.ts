import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth-middleware";

const passcodeSchema = z
  .string()
  .regex(/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{6,}$/, "Use at least six letters and digits.");

export const completeGoogleRegistration = createServerFn({ method: "POST" })
  .middleware([requireIdentity])
  .validator(z.object({
    companyName: z.string().trim().max(120).optional(),
    createCompany: z.boolean().default(false),
    requestedRole: z.enum(["admin", "member"]),
  }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const { data: registration, error } = await getServiceSupabase().rpc("register_company_v2", {
      p_user_id: identity.id,
      p_company_name: data.companyName ?? "",
      p_requested_role: data.requestedRole,
      p_create_company: data.createCompany,
    });
    if (error) throw error;
    if (!registration?.organization_id) throw new Error("Company registration did not return an organization.");
    return {
      alreadyRegistered: Boolean(registration.already_registered),
      foundingAdmin: Boolean(registration.founding_admin),
      requestedRole: registration.role,
      organizationId: registration.organization_id,
      companyName: registration.company_name,
    };
  });

export const getGoogleAuthFlowState = createServerFn({ method: "GET" })
  .middleware([requireIdentity])
  .validator(z.object({ companyName: z.string().trim().max(120).optional() }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const [
      { data: profile, error: profileError },
      { data: passcode, error: passcodeError },
      { data: verified, error: verifiedError },
    ] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("organization_id, registration_completed_at, account_status, team_status, role")
          .eq("id", identity.id)
          .maybeSingle(),
        supabase.from("login_passcodes").select("user_id").eq("user_id", identity.id).maybeSingle(),
        supabase
          .from("auth_passcode_sessions")
          .select("session_id")
          .eq("user_id", identity.id)
          .eq("session_id", identity.sessionId)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
      ]);
    if (profileError) throw profileError;
    if (passcodeError) throw passcodeError;
    if (verifiedError) throw verifiedError;
    if (!profile) throw new Error("Your account profile is still being created. Try again shortly.");
    let companyName: string | null = null;
    if (profile.organization_id) {
      const { data: organization, error: organizationError } = await supabase
        .from("organizations")
        .select("name, normalized_name")
        .eq("id", profile.organization_id)
        .maybeSingle();
      if (organizationError) throw organizationError;
      if (!organization) throw new Error("Your company workspace is unavailable.");
      companyName = organization.name;
      if (
        data.companyName &&
        organization.normalized_name !== data.companyName.trim().replace(/\s+/g, " ").toLowerCase()
      ) {
        throw new Error(`This Google account belongs to ${organization.name}, not ${data.companyName}.`);
      }
    }
    return {
      needsRegistration: !profile.organization_id || !profile.registration_completed_at,
      accountStatus: profile.account_status,
      teamStatus: profile.team_status,
      role: profile.role,
      organizationId: profile.organization_id,
      companyName,
      passcodeConfigured: Boolean(passcode),
      passcodeVerified: Boolean(verified),
    };
  });

export const setInitialLoginPasscode = createServerFn({ method: "POST" })
  .middleware([requireIdentity])
  .validator(z.object({ passcode: passcodeSchema }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const { data: result, error } = await supabase.rpc("set_login_passcode", {
      p_user_id: identity.id,
      p_session_id: identity.sessionId,
      p_passcode: data.passcode,
    });
    if (error) throw error;
    if (!result?.ok) throw new Error("A passcode is already set. Verify it or use Change passcode.");
    return { ok: true };
  });

export const verifyLoginPasscode = createServerFn({ method: "POST" })
  .middleware([requireIdentity])
  .validator(z.object({ passcode: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const { data: result, error } = await supabase.rpc("verify_login_passcode", {
      p_user_id: identity.id,
      p_session_id: identity.sessionId,
      p_passcode: data.passcode,
    });
    if (error) throw error;
    if (!result?.verified) {
      throw new Error(result?.locked_until
        ? `Too many incorrect attempts. Try again after ${new Date(result.locked_until).toLocaleTimeString()}.`
        : "Incorrect passcode. Check it and try again.");
    }
    return { ok: true };
  });

export const changeLoginPasscode = createServerFn({ method: "POST" })
  .middleware([requireIdentity])
  .validator(z.object({ currentPasscode: z.string().min(1).max(128), newPasscode: passcodeSchema }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const { data: result, error } = await supabase.rpc("change_login_passcode", {
      p_user_id: identity.id,
      p_session_id: identity.sessionId,
      p_current_passcode: data.currentPasscode,
      p_new_passcode: data.newPasscode,
    });
    if (error) throw error;
    if (!result?.verified) {
      throw new Error(result?.locked_until
        ? `Too many incorrect attempts. Try again after ${new Date(result.locked_until).toLocaleTimeString()}.`
        : "Current passcode is incorrect.");
    }
    return { ok: true };
  });

export const resetLoginPasscode = createServerFn({ method: "POST" })
  .middleware([requireIdentity])
  .validator(z.object({ passcode: passcodeSchema }))
  .handler(async ({ data, context }) => {
    const identity = context.identity;
    if (Date.now() / 1000 - identity.authTime > 10 * 60) {
      throw new Error("Please sign out and complete Google sign-in again before resetting your passcode.");
    }
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const { data: result, error } = await supabase.rpc("reset_login_passcode", {
      p_user_id: identity.id,
      p_session_id: identity.sessionId,
      p_new_passcode: data.passcode,
    });
    if (error) throw error;
    if (!result?.ok) throw new Error("Could not reset the passcode. Please try again.");
    return { ok: true };
  });
