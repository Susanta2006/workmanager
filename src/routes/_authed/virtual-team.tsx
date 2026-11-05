import { createFileRoute, Navigate } from "@tanstack/react-router";
import VirtualTeamPage from "@/components/virtual-team/VirtualTeamPage";
import { useOperatingMode } from "@/lib/virtual-team";

export const Route = createFileRoute("/_authed/virtual-team")({
  head: () => ({ meta: [{ title: "Virtual Team · WorkManager" }] }),
  component: VirtualTeamRoute,
});

// Virtual Team is only available in Solo mode. In Team mode the human Team page owns the slot.
function VirtualTeamRoute() {
  const mode = useOperatingMode();
  if (mode.isPending) return null;
  if (mode.data?.operating_mode !== "solo") return <Navigate to="/team" replace />;
  return <VirtualTeamPage />;
}
