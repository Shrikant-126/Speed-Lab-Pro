# Deployment

## 1. Supabase (database + auth)

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Collect: Project URL, `anon` key (public), `service_role` key (secret).

## 2. Worker (Docker / VM – not Vercel)

The worker runs Chromium, Playwright, Sharp and, optionally, Lighthouse. Deploy it to Fly.io, Railway, Render, Google Cloud Run (min instances ≥ 1), or any VM.

```bash
docker build -f worker/Dockerfile -t speedlab-worker .
docker run -p 8787:8787 \
  -e WORKER_SECRET=<long-random-string> \
  -e PAGESPEED_API_KEY=... \
  -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e WORKER_CONCURRENCY=2 \
  speedlab-worker
```

Recommended: 2 vCPU / 2–4 GB RAM per 2 concurrent scans.

Isolation: run the container without access to your private network or cloud metadata endpoints (egress firewall or a separate VPC). Request-level SSRF checks are already enforced, but network isolation is defence in depth. This matters especially when `LIGHTHOUSE_MODE=local`, because Lighthouse's own Chrome is not request-intercepted.

The worker must use the same Supabase credentials as the API, because it saves the reports.

## 3. Frontend + API on Vercel

1. Import the repository in Vercel (root directory = repo root). `vercel.json` already configures the install/build commands, `dist` output (repo root), the `/api/*` function and SPA rewrites.
2. Environment variables:

| Variable | Scope |
|---|---|
| `WORKER_URL` | `https://your-worker.example.com` |
| `WORKER_SECRET` | same value as on the worker |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser (public) |
| `CORS_ORIGINS` | your Vercel domain(s) |
| `PAGESPEED_API_KEY` | optional on Vercel (used by the worker) |

3. Deploy. Check **Settings → System status** in the dashboard.

Notes:
- Vercel Functions limit request bodies to about 4.5 MB, so project uploads are capped at 4 MB on Vercel. Self-host the API (`npm run start:server`) for uploads up to 25 MB.
- Rate limits are in-memory per function instance. For strict global limits, put a shared store (e.g. Upstash Redis) behind `express-rate-limit`.
- Without Supabase on Vercel, data would go to the ephemeral `/tmp`. Always configure Supabase in production.

## 4. Self-hosting everything on one VM

```bash
npm install && npm run browsers && npm run build
NODE_ENV=production WORKER_SECRET=... npm run start:worker    # :8787
WORKER_URL=http://localhost:8787 WORKER_SECRET=... npm run start:server   # :8080
# serve dist/ with nginx and proxy /api to :8080
```
