import { createFileRoute } from "@tanstack/react-router";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { completeGoogleRegistration } from "@/lib/auth-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/pending-approval")({
  ssr: false,
  head: () => ({
    meta: [
      {
        title: "Awaiting approval · WorkManager",
        name: "robots",
        content: "noindex",
      },
    ],
  }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, isLoadingAuth, logout, refresh } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [requestedRole, setRequestedRole] = useState<"admin" | "member">("member");
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    if (user?.role === "admin" || user?.role === "member") setRequestedRole(user.role);
  }, [user?.role]);

  useEffect(() => {
    if (user?.account_status === "approved" && user.team_status === "active") {
      window.location.replace(user.passcode_verified ? "/dashboard" : "/passcode");
    }
  }, [user]);

  async function checkApproval() {
    if (checking) return;
    setChecking(true);
    setCheckMessage("");
    try {
      const result = await refresh();
      if (!result.user) {
        setCheckMessage("Your sign-in could not be verified. Please sign out and sign in again.");
      } else if (result.user.account_status !== "approved" || result.user.team_status !== "active") {
        setCheckMessage("Your account is still waiting for admin approval.");
      }
    } catch (error: any) {
      setCheckMessage(
        error instanceof Error
          ? `Could not check approval status: ${error.message}`
          : "Could not check approval status. Please try again.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function saveRequestedRole() {
    if (!user || savingRole || user.account_status !== "pending") return;
    setSavingRole(true);
    setCheckMessage("");
    try {
      const result = await completeGoogleRegistration({ data: { requestedRole } });
      if (!result.foundingAdmin && result.requestedRole !== requestedRole) {
        throw new Error("The requested role was not confirmed by the workspace database.");
      }
      const refreshed = await refresh();
      if (refreshed.user?.role !== requestedRole) {
        throw new Error("The role request did not appear in your profile. Please try again.");
      }
      setCheckMessage(`Your ${requestedRole === "admin" ? "Admin" : "Member"} access request is saved.`);
    } catch (error: any) {
      setCheckMessage(
        error instanceof Error ? `Could not save your role request: ${error.message}` : "Could not save your role request.",
      );
    } finally {
      setSavingRole(false);
    }
  }

  if (isLoadingAuth)
    return <Skeleton className="mx-auto mt-24 h-[220px] max-w-md rounded-xl" />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="surface w-full max-w-md p-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Clock3 className="h-5 w-5" />
        </span>
        <h1 className="font-heading text-lg font-bold">
          Waiting for admin approval
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {user?.email ? (
            <span className="font-medium text-foreground">{user.email}</span>
          ) : (
            "Your account"
          )}{" "}
          is registered, but the founding admin has not approved access yet.
          Once approved, sign in with Google and your passcode to use the workspace.
        </p>
        {user?.account_status === "pending" && (
          <div className="mt-4 rounded-lg border border-border p-3 text-left">
            <p className="text-xs text-muted-foreground">
              Requested role saved in your company profile:{" "}
              <span className="font-semibold text-foreground">
                {user.role === "admin" ? "Admin" : "Member"}
              </span>
            </p>
            <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Requested role">
              {(["member", "admin"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={requestedRole === value}
                  onClick={() => setRequestedRole(value)}
                  disabled={savingRole}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium capitalize ${
                    requestedRole === value ? "border-primary bg-primary/5 text-primary" : "border-border"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <Button
              className="mt-2 w-full"
              variant="outline"
              size="sm"
              onClick={saveRequestedRole}
              disabled={savingRole || user.role === requestedRole}
            >
              {savingRole ? "Saving role request…" : "Save requested role"}
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={checkApproval} disabled={checking}>
            {checking ? "Checking approval…" : "Check again"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
        {checkMessage && (
          <p role="status" className="mt-3 text-left text-xs leading-relaxed text-muted-foreground">
            {checkMessage}
          </p>
        )}
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-secondary/50 p-3 text-left text-[11.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            Only admins can approve registrations. Admin requests are subject
            to the workspace admin limit. Need access sooner? Ask the
            admin to open{" "}
            <span className="font-medium text-foreground">Team</span> in the
            workspace and approve your account.
          </p>
        </div>
      </div>
    </div>
  );
}
