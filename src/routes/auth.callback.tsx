import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { completeGoogleRegistration, getGoogleAuthFlowState } from "@/lib/auth-fns";
import { sanitizeReturnTo } from "@/lib/authReturnTo";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const AUTH_FLOW_KEY = "workmanager-google-auth-flow";
const RETURN_TO_KEY = "workmanager-auth-return-to";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Google sign-in · WorkManager" }, { name: "robots", content: "noindex" }] }),
  component: GoogleAuthCallback,
});

type FlowState = Awaited<ReturnType<typeof getGoogleAuthFlowState>>;

// Routes a finished sign-in to the next step. Reads only browser storage and the state passed in,
// so it lives outside the component and needs no effect dependency.
function finish(state: FlowState) {
  if (state.accountStatus !== "approved") {
    window.location.replace("/pending-approval");
    return;
  }
  if (!state.passcodeConfigured || !state.passcodeVerified) {
    window.location.replace("/passcode");
    return;
  }
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  window.location.replace(sanitizeReturnTo(returnTo));
}

function GoogleAuthCallback() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [needsRole, setNeedsRole] = useState(false);
  const [role, setRole] = useState<"member" | "admin">("member");

  useEffect(() => {
    let active = true;
    let started = false;
    const processSession = async (session: Session | null) => {
      if (!session?.user || started) return;
      started = true;
      try {
        const flow = JSON.parse(sessionStorage.getItem(AUTH_FLOW_KEY) || "{}");
        const companyName = typeof flow.companyName === "string" ? flow.companyName : "";
        if (flow.intent === "register" && (flow.requestedRole === "admin" || flow.requestedRole === "member")) {
          const registration = await completeGoogleRegistration({
            data: {
              companyName,
              createCompany: Boolean(flow.createCompany),
              requestedRole: flow.requestedRole,
            },
          });
          if (!registration.foundingAdmin && registration.requestedRole !== flow.requestedRole) {
            throw new Error("The requested role was not saved. Please register again or contact your workspace admin.");
          }
          sessionStorage.removeItem(AUTH_FLOW_KEY);
        }
        const state = await getGoogleAuthFlowState({
          data: { companyName: companyName || undefined },
        });
        if (!active) return;
        if (flow.intent === "reset-passcode") {
          window.location.replace("/passcode?mode=recover");
          return;
        }
        if (flow.intent === "login" && state.needsRegistration) {
          await getSupabase().auth.signOut();
          if (active) {
            setError("This Google account is not registered in this workspace. Register first, then sign in.");
            setBusy(false);
          }
          return;
        }
        if (state.needsRegistration) {
          setNeedsRole(true);
          setBusy(false);
          return;
        }
        sessionStorage.removeItem(AUTH_FLOW_KEY);
        finish(state);
      } catch (caught: any) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Google sign-in could not be completed.");
          setBusy(false);
        }
      }
    };
    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void processSession(session);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (data.session) return processSession(data.session);
      if (active) {
        setError("Google sign-in did not return a session. Please try again.");
        setBusy(false);
      }
    }).catch((caught) => {
      if (active) {
        setError(caught?.message || "Could not finish Google sign-in.");
        setBusy(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submitRole() {
    setBusy(true);
    setError("");
    try {
      const flow = JSON.parse(sessionStorage.getItem(AUTH_FLOW_KEY) || "{}");
      const companyName = typeof flow.companyName === "string" ? flow.companyName : "";
      const registration = await completeGoogleRegistration({
        data: {
          companyName,
          createCompany: Boolean(flow.createCompany),
          requestedRole: role,
        },
      });
      if (!registration.foundingAdmin && registration.requestedRole !== role) {
        throw new Error("The requested role was not saved. Please choose your role again.");
      }
      sessionStorage.removeItem(AUTH_FLOW_KEY);
      const state = await getGoogleAuthFlowState({
        data: { companyName: companyName || undefined },
      });
      finish(state);
    } catch (caught: any) {
      setError(caught instanceof Error ? caught.message : "Could not submit your access request.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={needsRole ? "Register" : "Signing you in"} subtitle="Secure Google authentication">
      {needsRole ? (
        <>
          <p className="text-sm text-muted-foreground">
            This Google account is not yet linked to this company. Choose the role you are requesting; the first user
            creating a new company becomes its admin, while requests to join an existing company await approval.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Requested account role">
            {(["member", "admin"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                onClick={() => setRole(value)}
                className={`rounded-lg border p-3 text-left capitalize ${role === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={submitRole} disabled={busy}>
            {busy ? "Submitting…" : "Submit access request"}
          </Button>
        </>
      ) : busy ? (
        <p className="text-center text-sm text-muted-foreground">Verifying your Google account and access status…</p>
      ) : (
        <>
          <p className="text-sm text-destructive">{error}</p>
          <div className="mt-4 flex gap-2">
            <Button asChild variant="outline" className="flex-1"><Link to="/login">Try sign-in again</Link></Button>
            <Button asChild className="flex-1"><Link to="/register">Register</Link></Button>
          </div>
        </>
      )}
      {error && needsRole && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </AuthLayout>
  );
}
