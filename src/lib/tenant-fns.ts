import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const companyNameSchema = z.string().trim().min(2).max(120);

// Company names match ignoring case, spacing and symbols, so "Acme Ltd", "acme ltd." and
// "Acme Ltd™" all find the same company. The stored name is always what the app uses afterwards.
const nameKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Turns "table missing" style database errors into one clear message for people using the app.
function databaseError(error: { message?: string; code?: string }) {
  const msg = error.message || "";
  if (
    msg.includes("schema cache") ||
    msg.includes("Could not find the table") ||
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    error.code === "PGRST200" ||
    error.code === "PGRST301" ||
    error.code === "42P01"
  ) {
    return new Error("The workspace database is not set up yet. Please contact your administrator.");
  }
  return new Error(`Could not check the company workspace: ${msg}`);
}

export const getWorkspaceStatus = createServerFn({ method: "GET" })
  .validator(z.object({}))
  .handler(async () => {
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const { data, error } = await getServiceSupabase()
      .from("organizations")
      .select("name")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw databaseError(error);
    const row = data?.[0];
    return { hasCompany: Boolean(row), companyName: row?.name ?? null };
  });

export const resolveCompany = createServerFn({ method: "GET" })
  .validator(z.object({ companyName: companyNameSchema }))
  .handler(async ({ data }) => {
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const supabase = getServiceSupabase();
    const requested = data.companyName.replace(/\s+/g, " ").trim();
    const { data: organizations, error } = await supabase
      .from("organizations")
      .select("id, name, normalized_name")
      .order("created_at", { ascending: true });
    if (error) throw databaseError(error);
    const rows = organizations ?? [];
    const wanted = nameKey(requested);
    const organization =
      rows.find((row) => row.normalized_name === requested.toLowerCase()) ??
      (wanted ? rows.find((row) => nameKey(row.name) === wanted) : undefined);
    // A standalone installation has exactly one company. Only the first registrant may create it.
    return {
      companyName: organization?.name ?? requested,
      exists: Boolean(organization),
      canCreateCompany: rows.length === 0,
      workspaceName: rows[0]?.name ?? null,
    };
  });
