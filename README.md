# KD Social Analytics

A cross-platform social media analytics dashboard. Link your accounts, pull daily
metrics, see which posts performed best, view weekly/monthly trends, and export reports.

Scope: you + a few clients/team (light auth, multi-account). Stack: Next.js 16 (App
Router) + Postgres (Drizzle) + Auth.js, deployed on Vercel with a daily cron sync.

## Status

| Platform | Status |
|---|---|
| **YouTube** | ✅ Live (Phase 1) |
| **Instagram / Facebook / Threads** | ✅ Live (Phase 2 — Meta Graph + Threads API) |
| **TikTok** | ✅ Live (Phase 3 — Login Kit + Display API) |
| X (Twitter) | ⏸ API gated (paid ~$200/mo) — ✅ usable via file upload |
| LinkedIn | ⏸ API gated (partner approval) — ✅ usable via file upload |

> **Any platform** also works via **`/import`** (upload its analytics CSV/XLSX) with no API setup.

## Two ways to get data in

1. **Connect via API** (live, auto-synced daily) — for platforms you've set up OAuth for.
2. **Upload an export** (`/import`) — drop the CSV/XLSX that any platform lets you export
   from its analytics. Columns are auto-detected and mapped onto the same normalized model,
   so the data shows up on the dashboard exactly like API-synced data. This needs **no API
   approval**, so it works for every platform (incl. X / LinkedIn) and for backfilling history.

## How it works

- **Adapters** (`src/lib/platforms/*`) implement a shared `PlatformAdapter` interface so the
  rest of the app never sees platform-specific JSON. YouTube is the reference implementation.
- **Manual imports** (`src/lib/import/*`) parse an uploaded export and auto-map its columns
  (synonym matching on whole-word boundaries) into the same `NormalizedPost` / metrics shape.
  Imported data attaches to a "manual" account (no tokens; skipped by the API sync).
- **Daily snapshots:** `src/lib/sync.ts` pulls posts + metrics and writes one
  `metrics_daily` row per post per day, so trends and "best post in period" are cheap to query.
- **Sync trigger:** `vercel.json` runs `/api/sync` daily; the "Sync now" button hits the same
  route. It's protected by `CRON_SECRET` (cron) or an authenticated session (UI).
- **OAuth tokens** are encrypted at rest (AES-256-GCM, `src/lib/crypto.ts`).
- **Workspaces:** each linked account belongs to a workspace so you can isolate a client's
  accounts. The sidebar switcher sets the active workspace (cookie-based); the dashboard,
  connections, exports, and connect flow are all scoped to it.
- **Export:** CSV + Excel (raw data) and a formatted **PDF report** with KPIs + top posts
  (`src/lib/pdf-report.tsx`, via `@react-pdf/renderer`).

## Local setup

1. **Install:** `npm install`
2. **Database:** create a Postgres database (Neon, Supabase, or local).
3. **Env:** copy `.env.example` → `.env` and fill in values:
   - `DATABASE_URL`
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `ENCRYPTION_KEY` — `openssl rand -hex 32`
   - `CRON_SECRET` — `openssl rand -hex 32`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` + `ALLOWED_EMAILS` (your login)
   - `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` (to connect YouTube)
4. **Migrate schema:** `npm run db:push`
5. **Run:** `npm run dev` → http://localhost:3000

### Google / YouTube OAuth setup

- **App login:** create an OAuth client in Google Cloud, redirect URI
  `http://localhost:3000/api/auth/callback/google` → `AUTH_GOOGLE_ID/SECRET`.
- **YouTube data:** enable *YouTube Data API v3* and *YouTube Analytics API*; create a second
  OAuth client with redirect URI `http://localhost:3000/api/connect/youtube/callback`
  → `YOUTUBE_CLIENT_ID/SECRET`.

### Meta (Instagram / Facebook / Threads) setup

- Create a Meta app with **Facebook Login**. Set `META_APP_ID` / `META_APP_SECRET`.
- Add Valid OAuth redirect URIs for `/api/connect/facebook/callback` and
  `/api/connect/instagram/callback`.
- Connecting Facebook imports every Page you manage; connecting Instagram imports each
  IG **Business/Creator** account linked to those Pages (one linked account each).
- **Threads** uses a separate API — add the Threads use case to the same app (or set
  `THREADS_APP_ID/SECRET`) and the redirect URI `/api/connect/threads/callback`.
- Insights permissions require **App Review** before they work on accounts you don't own.

### TikTok setup

- Create an app on **TikTok for Developers** and add **Login Kit** + the **Display API**.
- Enable scopes `user.info.basic`, `user.info.stats`, `video.list`; set
  `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
- Redirect URI: `/api/connect/tiktok/callback` (TikTok requires HTTPS in production;
  use a tunnel like ngrok for local OAuth testing).
- Apps start in sandbox/unaudited mode (only test users); submit for audit to connect
  any account.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push the Drizzle schema to the database |
| `npm run db:generate` / `db:migrate` | Versioned migrations |
| `npm run db:studio` | Drizzle Studio (browse data) |

## Verify end-to-end

1. Sign in at `/login` (email must be in `ALLOWED_EMAILS`).
2. Go to **Connections** → **Connect** YouTube → complete OAuth.
3. Click **Sync now** → confirm posts appear on the **Dashboard**.
4. Try the range toggle, sort metric, and **CSV/Excel** export buttons.

## Adding a platform

1. Create `src/lib/platforms/<name>.ts` implementing `PlatformAdapter`.
2. Register it in `src/lib/platforms/index.ts` (`adapters` map; set `status: "live"`).
3. Add its credentials to `src/lib/env.ts` and `.env.example`.

The sync engine, dashboard, and export pick it up automatically.
