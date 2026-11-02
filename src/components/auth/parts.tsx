import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { returnToSearch } from "@/lib/authReturnTo";

// Small pieces the auth pages share.

export function AuthError({ children }: any) {
  if (!children) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}

export function SubmitButton({ busy, busyLabel, children, ...props }: any) {
  return (
    <Button type="submit" className="h-12 w-full font-medium" disabled={busy} {...props}>
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function OrDivider() {
  return (
    <div className="relative mb-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-3 text-muted-foreground">or</span>
      </div>
    </div>
  );
}

// A link between auth screens that carries the way back (?returnTo=) along.
export function AuthLink({
  to,
  returnTo,
  className = "font-medium text-primary hover:underline",
  children,
}: {
  to: "/login" | "/register";
  returnTo?: string;
  className?: string;
  children: any;
}) {
  return (
    <Link to={to} search={returnToSearch(returnTo)} className={className}>
      {children}
    </Link>
  );
}

/** Turns Supabase Auth errors into messages a person can act on. */
export function describeAuthError(error: any): string {
  const message: string = error?.message ?? "";
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. Check your inbox for the confirmation link.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists. Log in instead.";
  if (/password should be at least/i.test(message)) return "Choose a password of at least 12 characters.";
  if (/rate limit|too many/i.test(message) || error?.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (/network|fetch/i.test(message)) return "Could not reach the server. Check your connection and try again.";
  return message || "Something went wrong. Please try again.";
}
