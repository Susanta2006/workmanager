import { redirect } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { sessionQuery } from "@/lib/AuthContext";

class AccessError extends Error {}

/**
 * Login gate for the pathless layout route src/routes/_authed.tsx. Signed out goes to /login
 * with the way back. Signed in but not yet approved goes to /pending-approval.
 */
export async function requireSignedIn({ context, location }: any) {
  const { user, error } = await context.queryClient.ensureQueryData(sessionQuery);
  if (error) throw new AccessError(error.message);
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: location.href } });
  }
  if (user.team_status === "inactive") {
    throw new AccessError("Your access has been deactivated by a workspace admin.");
  }
  if (user.account_status !== "approved") {
    throw redirect({ to: "/pending-approval" });
  }
  if (!user.passcode_verified) {
    throw redirect({ to: "/passcode" } as any);
  }
  return { user };
}

export function AuthGateError({ error }: any) {
  return <DefaultCatchBoundary error={error} />;
}
