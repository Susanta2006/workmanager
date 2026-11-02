import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError } from "@/components/auth/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeLoginPasscode,
  getGoogleAuthFlowState,
  resetLoginPasscode,
  setInitialLoginPasscode,
  verifyLoginPasscode,
} from "@/lib/auth-fns";
import { getSupabase } from "@/lib/supabase";
import { sanitizeReturnTo } from "@/lib/authReturnTo";

const RETURN_TO_KEY = "workmanager-auth-return-to";
const PASSCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePasscode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => PASSCODE_ALPHABET[byte % PASSCODE_ALPHABET.length]).join("");
}

export const Route = createFileRoute("/passcode")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "change" ? "change" as const : search.mode === "recover" ? "recover" as const : "verify" as const,
  }),
  head: () => ({ meta: [{ title: "Secure your sign-in · WorkManager" }, { name: "robots", content: "noindex" }] }),
  component: PasscodePage,
});

function PasscodePage() {
  const { mode } = Route.useSearch();
  const [flow, setFlow] = useState<any>(null);
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [passcode, setPasscode] = useState(generatePasscode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getGoogleAuthFlowState({ data: {} })
      .then((state) => {
        if (active) setFlow(state);
      })
      .catch((caught) => {
        if (active) setError(caught?.message || "Sign in with Google before setting a passcode.");
      });
    return () => { active = false; };
  }, []);

  async function submit(event: any) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "change") {
        await changeLoginPasscode({ data: { currentPasscode, newPasscode: passcode } });
      } else if (mode === "recover") {
        await resetLoginPasscode({ data: { passcode } });
      } else if (flow?.passcodeConfigured) {
        await verifyLoginPasscode({ data: { passcode: currentPasscode } });
      } else {
        await setInitialLoginPasscode({ data: { passcode } });
      }

      sessionStorage.removeItem("workmanager-google-auth-flow");
      const state = await getGoogleAuthFlowState({ data: {} });
      if (state.accountStatus !== "approved") {
        window.location.replace("/pending-approval");
        return;
      }
      const returnTo = sessionStorage.getItem(RETURN_TO_KEY);
      sessionStorage.removeItem(RETURN_TO_KEY);
      window.location.replace(sanitizeReturnTo(returnTo));
    } catch (caught: any) {
      setError(caught?.message || "Could not verify or save your passcode.");
      setBusy(false);
    }
  }

  if (!flow) {
    return (
      <AuthLayout icon={KeyRound} title={error ? "Google sign-in required" : "Checking your sign-in"} subtitle={error ? "Sign in with Google to continue." : "Please wait…"}>
        {error ? (
          <>
            <AuthError>{error}</AuthError>
            <Button asChild className="mt-4 w-full"><Link to="/login">Go to sign in</Link></Button>
          </>
        ) : null}
      </AuthLayout>
    );
  }

  const changing = mode === "change";
  const recovering = mode === "recover";
  const verifying = mode === "verify" && flow?.passcodeConfigured;
  const setup = !changing && (!flow?.passcodeConfigured || recovering);
  const title = changing ? "Change your passcode" : recovering ? "Reset your passcode" : verifying ? "Enter your passcode" : "Set your passcode";

  return (
    <AuthLayout icon={KeyRound} title={title} subtitle="Your Google sign-in is protected by a second passcode check">
      <AuthError>{error}</AuthError>
      <form onSubmit={submit}>
      {setup && (
        <p className="mb-4 text-sm text-muted-foreground">
          {recovering
            ? "Google has verified your account again. Choose a new passcode to replace the one you forgot."
            : "A passcode was generated for you. Save it somewhere secure, or edit it before continuing. Use at least six letters and digits."}
        </p>
      )}
      {!setup && (
        <div className="mb-4 space-y-2">
          <Label htmlFor="current-passcode">{changing ? "Current passcode" : "Passcode"}</Label>
          <Input
            id="current-passcode"
            type="password"
            autoComplete="one-time-code"
            value={currentPasscode}
            onChange={(event) => setCurrentPasscode(event.target.value)}
            autoFocus
            disabled={busy}
            required
          />
        </div>
      )}
      {(setup || changing) && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-passcode">{changing ? "New passcode" : "Your passcode"}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPasscode(generatePasscode())}
              disabled={busy}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Generate
            </Button>
          </div>
          <Input
            id="new-passcode"
            type="text"
            autoComplete="new-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            minLength={6}
            maxLength={128}
            disabled={busy}
            required
          />
          <p className="text-xs text-muted-foreground">Letters and numbers only, with at least one of each.</p>
        </div>
      )}
        <Button className="h-11 w-full" disabled={busy || (!setup && !currentPasscode) || ((setup || changing) && !passcode)}>
          {busy ? "Please wait…" : changing ? "Save new passcode" : verifying ? "Verify and sign in" : recovering ? "Save new passcode" : "Save passcode and continue"}
        </Button>
      </form>
      {verifying && (
        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-primary underline"
          disabled={busy}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              const supabase = getSupabase();
              const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
              if (signOutError) throw signOutError;
              sessionStorage.setItem("workmanager-google-auth-flow", JSON.stringify({ intent: "reset-passcode" }));
              const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback`,
                  queryParams: { prompt: "select_account", max_age: "0" },
                },
              });
              if (oauthError) throw oauthError;
            } catch (caught: any) {
              setError(caught?.message || "Could not restart Google verification.");
              setBusy(false);
            }
          }}
        >
          Forgot passcode? Verify with Google to reset it
        </button>
      )}
      {changing && (
        <Button asChild variant="link" className="mt-3 w-full">
          <Link to="/dashboard">Cancel</Link>
        </Button>
      )}
      {setup && (
        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-muted-foreground underline"
          onClick={async () => {
            await getSupabase().auth.signOut();
            window.location.replace("/login");
          }}
        >
          Sign out
        </button>
      )}
    </AuthLayout>
  );
}
