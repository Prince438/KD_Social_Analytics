# Deploying to Production

This gets the app live on Vercel with a real Postgres database and Google login.
Estimated time: ~30 minutes. You'll need accounts on Neon (or Supabase), Google
Cloud, GitHub, and Vercel — all free.

Order: **Database → Google login → Push to GitHub → Vercel → Migrate → First login.**

---

## 1. Database (Neon)

1. Create a project at <https://neon.tech>.
2. Copy the **pooled** connection string (Dashboard → Connect → "Pooled connection").
   It looks like:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
3. Save it — this is your `DATABASE_URL`. (Supabase works too; use its "Connection
   pooling" / transaction-mode string.)

The app uses `prepare: false`, which is compatible with pooled (PgBouncer) endpoints.

---

## 2. Google login (Auth.js)

This is how you + your team sign in (the local "Dev sign-in" is disabled in production).

1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name + your email.
   Add yourself as a Test user (or Publish when ready).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. Authorized redirect URI (use your real Vercel domain once you have it):
   `https://YOUR-APP.vercel.app/api/auth/callback/google`
   (you can add `http://localhost:3000/api/auth/callback/google` too for local).
5. Copy the **Client ID** and **Client secret** → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
6. Decide `ALLOWED_EMAILS` — comma-separated emails allowed to sign in (you + clients/team).

---

## 3. Push to GitHub

```bash
# from the project root
git add -A
git commit -m "Deploy-ready build"
gh repo create kd-social-analytics --private --source=. --push
# or: create a repo on github.com, then:
#   git remote add origin https://github.com/YOU/kd-social-analytics.git
#   git push -u origin master
```

`.env` is gitignored, so no secrets are pushed.

---

## 4. Vercel

1. <https://vercel.com> → **Add New → Project** → import the GitHub repo.
2. Framework preset auto-detects **Next.js**. Don't deploy yet — first add env vars.
3. **Settings → Environment Variables** (Production), add all of these:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled string from step 1 |
   | `APP_URL` | `https://YOUR-APP.vercel.app` (your Vercel domain) |
   | `AUTH_SECRET` | generate: `openssl rand -hex 32` |
   | `ENCRYPTION_KEY` | generate: `openssl rand -hex 32` |
   | `CRON_SECRET` | generate: `openssl rand -hex 32` |
   | `AUTH_GOOGLE_ID` | from step 2 |
   | `AUTH_GOOGLE_SECRET` | from step 2 |
   | `ALLOWED_EMAILS` | `you@example.com,teammate@example.com` |

   Add platform credentials (`YOUTUBE_*`, `META_*`, `TIKTOK_*`) later, only for
   platforms you wire up. The app runs fine without them (those platforms just
   show "Setup needed").
4. **Deploy.**
5. After the first deploy you'll get the real domain — if it differs from what you
   guessed, update `APP_URL` and the Google redirect URI, then redeploy.

The daily sync cron is already configured in `vercel.json` (`/api/sync`, 06:00 UTC).
Vercel automatically sends `CRON_SECRET` as the auth header, which the route checks.

> **Note (Hobby plan):** serverless functions cap at 60s. The sync of a few accounts
> is well under that. If you connect many accounts later and it gets slow, upgrade to
> Pro (the route already declares `maxDuration = 300`).

---

## 5. Apply the database schema

The Neon database starts empty — apply the migrations once. From your machine:

```bash
# temporarily point at the prod DB
DATABASE_URL="<your-neon-pooled-url>" npm run db:migrate
```

(Or set it in a local `.env.production.local` and run the same command.) This creates
all tables. Re-run only when you add new migrations.

---

## 6. First login & data

1. Visit `https://YOUR-APP.vercel.app` → sign in with Google (must be in `ALLOWED_EMAILS`).
2. **Import** tab → upload an analytics export (works for any platform, no API needed), or
3. **Connections** → connect a platform once you've added its API credentials.

---

## Quick reference: what each secret is

- `AUTH_SECRET` — signs login sessions.
- `ENCRYPTION_KEY` — encrypts stored OAuth tokens at rest.
- `CRON_SECRET` — authorizes the daily sync endpoint.

Generate each with `openssl rand -hex 32`. Set them once in Vercel; never commit them.
