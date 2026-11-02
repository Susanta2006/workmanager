import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, UserPlus } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthError, AuthLink } from "@/components/auth/parts";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { safeReturnTo } from "@/lib/authReturnTo";
import { getSelectedCompanyName, setSelectedCompanyName } from "@/lib/tenant";
import { resolveCompany } from "@/lib/tenant-fns";

const ACCOUNT_TYPES = [
  { value: "member", label: "Member", hint: "Request access to work in the team workspace." },
  { value: "admin", label: "Admin", hint: "Request administrator access; the first registrant is activated automatically." },
] as const;

const AUTH_FLOW_KEY = "workmanager-google-auth-flow";
const RETURN_TO_KEY = "workmanager-auth-return-to";

type RegistrationTerms = {
  companyName: string;
  exists: boolean;
  canCreateCompany: boolean;
  workspaceName?: string | null;
};

export function RegisterPage() {
  const returnTo = safeReturnTo();
  const [accountType, setAccountType] = useState<"admin" | "member">("member");
  const [companyName, setCompanyName] = useState(getSelectedCompanyName);
  const [companyExists, setCompanyExists] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startGoogleRegistration(company: RegistrationTerms) {
    setError("");
    setBusy(true);
    try {
      setSelectedCompanyName(company.companyName);
      setCompanyName(company.companyName);
      sessionStorage.setItem(AUTH_FLOW_KEY, JSON.stringify({
        intent: "register",
        companyName: company.companyName,
        createCompany: !company.exists,
        requestedRole: accountType,
      }));
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
      setError(err instanceof Error ? err.message : "Could not start Google sign-up.");
      setBusy(false);
    }
  }

  async function register() {
    setError("");
    setBusy(true);
    try {
      const company = await resolveCompany({ data: { companyName } });
      setCompanyExists(company.exists);
      if (!company.exists && !company.canCreateCompany) {
        throw new Error(
          company.workspaceName
            ? `This workspace already belongs to "${company.workspaceName}". Enter that exact company name to request access.`
            : "This workspace has no company yet. Register to create it."
        );
      }
      await startGoogleRegistration(company);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-up.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout icon={UserPlus} title="Register" subtitle="Continue securely with your Google account">
      <AuthError>{error}</AuthError>
      <label htmlFor="company-name" className="mb-1.5 block text-sm font-medium">Company name</label>
      <input
        id="company-name"
        autoComplete="organization"
        value={companyName}
        onChange={(event) => {
          setCompanyName(event.target.value);
          setCompanyExists(null);
        }}
        disabled={busy}
        required
        className="mb-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Your company name"
      />
      {companyExists !== null && (
        <p className="mb-4 text-xs text-muted-foreground">
          {companyExists
            ? `Joining ${companyName}; your request will wait for approval.`
            : `Creating ${companyName}; the first verified account becomes its administrator.`}
        </p>
      )}
      <p className="mb-4 text-xs text-muted-foreground">
        Learn how workspace data is kept separate on our{" "}
        <Link to="/security" className="font-medium text-primary underline underline-offset-4">security overview</Link>.
      </p>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">I am joining as</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {ACCOUNT_TYPES.map((option) => {
            const selected = accountType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAccountType(option.value)}
                disabled={busy}
                className={`rounded-lg border p-3 text-left transition ${
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mr-1 inline h-4 w-4 align-text-bottom text-primary" />
        Google supplies your verified email and profile name. Everyone else waits for the administrator’s approval.
      </div>
      <Button className="mt-5 h-12 w-full" onClick={register} disabled={busy}>
        {busy ? "Redirecting to Google…" : `Continue with Google as ${accountType === "admin" ? "Admin" : "Member"}`}
      </Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <AuthLink to="/login" returnTo={returnTo}>Sign in</AuthLink>
      </p>
    </AuthLayout>
  );
}
