import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = `User-agent: *
Allow: /$
Allow: /login
Allow: /register
Disallow: /api/
Disallow: /clients
Disallow: /projects
Disallow: /tasks
Disallow: /documents
Disallow: /payments
Disallow: /expenses
Disallow: /reports
Disallow: /team
Disallow: /settings
Disallow: /activity
Disallow: /notifications
Disallow: /pending-approval
Disallow: /auth/
Disallow: /passcode

Sitemap: ${origin}/sitemap.xml
`;
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});