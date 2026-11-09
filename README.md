# SpeedLab Pro

Advanced website performance analyzer and optimization platform: Lighthouse/PageSpeed Insights, Chrome UX Report field data, server/TTFB probing, Playwright + Chrome DevTools Protocol inspection and Sharp image measurements, turned into prioritised, evidence-based recommendations with ready-to-use HTML/CSS/JS, Shopify Liquid and WordPress code.

## Architecture

```
client/   React + Vite + Tailwind v4 + Recharts dashboard (15 lazy-loaded modules)
server/   Express REST API (local server or Vercel Function via api/index.js)
worker/   Long-running scan worker: job queue, PSI, CrUX, Lighthouse, Playwright/CDP, Sharp
shared/   Analysis engine, code generators, SSRF-safe networking, storage, upload optimizer
supabase/ PostgreSQL schema + RLS policies
```

Scan flow: `client → POST /api/jobs → server validates URL (SSRF) → worker job → collectors in parallel → buildReport() → saved (Supabase or local JSON) → client polls /api/jobs/:id`.

In local development the API runs the worker in-process (no `WORKER_URL`). In production the browser-based worker runs separately (Docker/VM). It never runs in Vercel serverless.

## Quick start (local)

Requirements: Node.js 20.10+.

```bash
npm install                 # installs all workspaces
npm run browsers            # downloads Chromium for Playwright (once)
cp .env.example .env        # then set PAGESPEED_API_KEY
npm run dev                 # API on :8080 + dashboard on http://localhost:5173
```

Get an API key at https://console.cloud.google.com/apis/credentials and enable **PageSpeed Insights API** and **Chrome UX Report API**. Without a key the anonymous PSI quota is usually exhausted (HTTP 429). Scans still run, but only with browser-measured data, and scores show as unavailable.

Run tests: `npm test`.

## What is real and what is not

| Data | Source | When unavailable |
|---|---|---|
| Scores, lab metrics, LCP phases, unused CSS/JS, third parties | Lighthouse via PSI (or local Lighthouse) | Shown as "Unavailable"; unthrottled Playwright timings are used and labelled |
| Field data (LCP, INP, CLS, FCP, TTFB p75) | CrUX API / PSI loadingExperience | Shown as unavailable – never estimated |
| DNS/TCP/TLS/TTFB, redirects, compression, cache, CDN | Document probe + navigation timing (measured from the scanner location) | — |
| Rendered vs natural image size, videos, listeners, DOM mutations, coverage, CDP metrics | Playwright + CDP | Element-level sections show limited data |
| WebP/AVIF/optimised sizes | Sharp re-encoding (measured) | Lighthouse estimates, labelled as estimates |

Every saving is labelled as **measured**, **Lighthouse estimate** or **estimate**. Backend root causes (database, application code) are never claimed from a public URL scan.

## Security

- URL validation: http/https only, ports 80/443/8080/8443, no credentials, internal hostnames are blocked.
- SSRF protection: every resolved IP must be public (loopback, private, link-local/metadata, CGNAT, multicast, reserved and IPv4-mapped ranges are blocked). DNS is re-checked at connect time (anti-rebinding), every redirect hop is re-validated, and every Playwright request is intercepted and checked.
- Timeouts and response-size limits on all outbound requests; rate limits on the API, scans and uploads.
- Secrets live only in server/worker environment variables. `VITE_*` variables contain only public values.
- Uploaded projects are processed in memory as data and are never executed. Only path-safe, whitelisted file types are accepted, and there are size, count and zip-bomb limits. Changes are applied only after explicit approval, and the output ZIP contains an untouched `original/` backup and a `CHANGES.md`.
- Worker isolation: the worker is a separate container running as an unprivileged user with a shared secret (`WORKER_SECRET`). Restrict its egress to the public internet (see docs).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment and [.env.example](.env.example) for all variables.
