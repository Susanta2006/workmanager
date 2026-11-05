import { createFileRoute } from "@tanstack/react-router";

// POST /api/virtual-team/message  { body: string, member_id?: string }
// Signed-in, approved users only. Saves the message and produces the reply on the server.
export const Route = createFileRoute("/api/virtual-team/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleVirtualTeamMessage } = await import("@/lib/virtual-team.server");
        return handleVirtualTeamMessage(request);
      },
    },
  },
});
