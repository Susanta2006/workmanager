import { createFileRoute } from "@tanstack/react-router";

// POST /api/ai/chat  { messages: [{ role: "user" | "assistant", content: string }] }
// Signed-in, approved users only. Calls Gemini on the server.
export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleChat } = await import("@/lib/ai.server");
        return handleChat(request);
      },
    },
  },
});
