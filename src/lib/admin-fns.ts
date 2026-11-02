import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

async function getFoundingAdminId(supabase: any, organizationId: any) {
  const { data, error } = await supabase
    .from("workspace_control")
    .select("founding_admin_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.founding_admin_id ?? null;
}

/**
 * Admin deletes a team member's account. Their profile is removed with it; records they created
 * stay in the workspace. The last admin cannot be deleted, and admins cannot delete themselves.
 */
export const deleteMemberAccount = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const caller = context?.user;
    if (!caller) throw new Error("Sign in to continue.");
    if (caller.role !== "admin") throw new Error("Only an admin can delete a member.");
    if (data.userId === caller.id) throw new Error("You cannot delete your own account here.");

    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const { createEntities } = await import("@/api/entities");
    const supabase = getServiceSupabase();

    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", data.userId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("That account no longer exists.");
    const foundingAdminId = await getFoundingAdminId(supabase, caller.organizationId);
    if (target.id === foundingAdminId) {
      throw new Error("The founding admin account cannot be deleted.");
    }
    if (target.role === "admin" && caller.id !== foundingAdminId) {
      throw new Error("Only the founding admin can delete another admin.");
    }

    if (target.role === "admin") {
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("role", "admin")
        .eq("account_status", "approved");
      if (countError) throw countError;
      if ((count || 0) <= 1) throw new Error("The last approved admin cannot be deleted.");
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(target.id);
    if (deleteError) throw deleteError;

    await createEntities(supabase, caller.organizationId).entities.ActivityLog.create({
      actor_name: caller.email,
      actor_email: caller.email,
      action: "Member deleted",
      entity_type: "User",
      entity_id: target.id,
      entity_label: target.full_name || target.email,
      details: "Account removed from the workspace",
    });

    return { ok: true };
  });
