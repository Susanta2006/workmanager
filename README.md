# WorkManager (Standalone Edition)

A single-company business workspace: clients, projects, tasks, documents, payments, expenses,
reports and team access. Sign-in uses Google through Supabase, with a passcode check on top.
One installation serves one company. The first person to register creates the company and
becomes its admin.

Full setup and deployment instructions: **DEPLOYMENT_GUIDE.md**.

## Quick start (local)

```bash
npm install
cp .env.example .env        # fill in your Supabase values; never commit .env
npm run dev                 # http://localhost:3000
```

Requires Node.js 24 or later.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Code checks |

## Project layout

- `supabase/schema.sql`: database tables, row-level security, storage buckets, the sign-up
  trigger, scheduled jobs (pg_cron). Run it once in the Supabase SQL Editor. Safe to rerun.
- `public/sw.js`: service worker for install-to-device and the offline shell.
- `src/routes/`: pages and server endpoints (file-based routing).
- `src/lib/auth.server.ts`: server-side sign-in verification. Every refusal writes a reason
  to the server log, for example `[auth] profile-missing`.
- `src/lib/supabase.server.ts`: server database clients. Uses the service-role key.
- `src/lib/developer.ts`: the developer profile shown on `/developer` and in the footer.
- `src/components/`: user interface.

## Notes

- Do not put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable. Anything prefixed `VITE_`
  is sent to the browser.
- `src/routeTree.gen.ts` is generated on every dev and build run. Do not edit it.
