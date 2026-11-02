import { createFileRoute } from "@tanstack/react-router";

// POST /api/ai/execute  { name, args }
// Applies a change the user has confirmed in Manager. Signed-in, approved users only.
export const Route = createFileRoute("/api/ai/execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleExecute } = await import("@/lib/ai.server");
        return handleExecute(request);
      },
    },
  },
});
