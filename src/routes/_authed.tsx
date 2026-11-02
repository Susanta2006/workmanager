import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import AppShell from "@/components/layout/AppShell";
import ManagerAssistant from "@/components/assistant/ManagerAssistant";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <ManagerAssistant />
    </>
  );
}
