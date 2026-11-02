import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, AuthLink } from "@/components/auth/parts";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { safeReturnTo } from "@/lib/authReturnTo";
import { getWorkspaceStatus } from "@/lib/tenant-fns";

const AUTH_FLOW_KEY = "workmanager-google-auth-flow";
const RETURN_TO_KEY = "workmanager-auth-return-to";

type WorkspaceStatus = { hasCompany: boolean; companyName: string | null };

export function LoginPage() {
  const returnTo = safeReturnTo();
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The standalone edition has one company, so sign-in needs no company name.
  useEffect(() => {
    let active = true;
    getWorkspaceStatus({ data: {} })
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((caught: any) => {
        if (active) setError(caught?.message || "Could not check the workspace.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function signIn() {
    setError("");
    setBusy(true);
    try {
      sessionStorage.setItem(AUTH_FLOW_KEY, JSON.stringify({ intent: "login" }));
      sessionStorage.setItem(RETURN_TO_KEY, returnTo);
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError) throw authError;
    } catch (err: any) {
      setError(err?.message || "Could not start Google sign-in.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout icon={LogIn} title="Welcome back" subtitle="Sign in to your workspace with Google">
      <AuthError>{error}</AuthError>
      {status === null && !error && (
        <p className="text-sm text-muted-foreground">Checking the workspace…</p>
      )}
      {status?.hasCompany && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Signing in to <span className="font-medium text-foreground">{status.companyName}</span>.
          </p>
          <Button className="h-12 w-full" onClick={signIn} disabled={busy}>
            {busy ? "Redirecting to Google…" : "Continue with Google"}
          </Button>
        </>
      )}
      {status && !status.hasCompany && (
        <p className="mb-4 text-sm text-muted-foreground">
          This workspace has no company yet. Register first; the first person to register creates the company.
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Want to understand how your data is protected?{" "}
        <Link to="/security" className="font-medium text-primary underline underline-offset-4">
          Read our security overview
        </Link>
      </p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to the workspace?{" "}
        <AuthLink to="/register" returnTo={returnTo}>
          Register
        </AuthLink>
      </p>
    </AuthLayout>
  );
}
