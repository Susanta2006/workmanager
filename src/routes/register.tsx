import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterPage } from "@/components/auth/RegisterPage";
import { sessionQuery } from "@/lib/AuthContext";

// Signed-in users are sent to the dashboard instead of seeing this form.
export const Route = createFileRoute("/register")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
  }),
  beforeLoad: async ({ context }) => {
    const { user } = await context.queryClient.ensureQueryData(sessionQuery);
    if (user) throw redirect({ to: "/dashboard" });
  },
  component: RegisterPage,
});
