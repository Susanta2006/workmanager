import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/LoginPage";
import { sessionQuery } from "@/lib/AuthContext";

// Signed-in users are sent to the dashboard instead of seeing this form.
export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const { user } = await context.queryClient.ensureQueryData(sessionQuery);
    if (user) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});
