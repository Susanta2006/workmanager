import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

function getSupabaseConfig() {
  const url = serverEnv("SUPABASE_URL") || serverEnv("VITE_SUPABASE_URL");
  const anonKey = serverEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("Server is missing SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }
  return { url, anonKey };
}

export function getServiceSupabase(): SupabaseClient {
  const { url } = getSupabaseConfig();
  const key = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getAnonServerSupabase(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getUserScopedSupabase(token: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
