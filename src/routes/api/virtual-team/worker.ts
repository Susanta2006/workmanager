import { createFileRoute } from "@tanstack/react-router";

// POST /api/virtual-team/worker
// Called by pg_cron through pg_net. Requires the x-worker-secret header.
export const Route = createFileRoute("/api/virtual-team/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleVirtualTeamWorker } = await import("@/lib/virtual-team.server");
        return handleVirtualTeamWorker(request);
      },
    },
  },
});
