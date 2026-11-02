import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

type AuthUser = Record<string, any> & {
  id: string;
  email: string;
  role: "admin" | "leader" | "member";
  account_status: "pending" | "approved";
  team_status: "active" | "inactive";
  passcode_verified: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  authError: { type: string; message: string } | null;
  refresh: () => Promise<Awaited<ReturnType<typeof loadSession>>>;
  logout: () => Promise<void>;
  navigateToLogin: () => void;
};

/** Loads the signed-in Supabase user and their profile (role and approval state). */
async function loadSession() {
  const supabase = getSupabase();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) return { user: null, error: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    return {
      user: null,
      error: { type: "no_profile", message: "Your profile is still being set up. Refresh in a moment." },
    };
  }
  const { data: passcodeVerified, error: passcodeError } = await supabase.rpc("is_passcode_verified");
  if (passcodeError) throw passcodeError;
  return {
    user: {
      ...profile,
      created_date: profile.created_at,
      passcode_verified: Boolean(passcodeVerified),
    },
    error: null,
  };
}

export const sessionQuery = queryOptions({
  queryKey: ["auth", "me"],
  queryFn: loadSession,
  staleTime: 60_000,
  retry: false,
});

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery(sessionQuery);

  // Sign-in, sign-out and token refresh all re-read the session.
  useEffect(() => {
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear();
      queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: data?.user ?? null,
      isAuthenticated: !!data?.user,
      isLoadingAuth: isPending,
      authError:
        data?.error ??
        (error ? { type: "unknown", message: error.message ?? "Failed to load session" } : null),
      refresh: () => queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 }),
      logout: async () => {
        await getSupabase().auth.signOut();
        queryClient.setQueryData(sessionQuery.queryKey, { user: null, error: null });
        window.location.href = "/login";
      },
      navigateToLogin: () => {
        window.location.href = "/login";
      },
    }),
    [data, error, isPending, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
