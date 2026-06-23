import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Core vars are required for the app to boot. Per-platform OAuth creds are
 * optional so the project can run with only the platforms you've set up
 * (e.g. just YouTube to start). Adapters check for their own creds at runtime
 * and surface a friendly error if a platform is used without configuration.
 */
const schema = z.object({
  // --- Core ---
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16),
  // 32-byte key, hex (64 chars) or base64. Used to encrypt OAuth tokens at rest.
  ENCRYPTION_KEY: z.string().min(32),
  // Protects the daily /api/sync cron endpoint.
  CRON_SECRET: z.string().min(16),

  // --- App login (Auth.js / Google) ---
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  // Comma-separated allowlist of emails permitted to sign in.
  ALLOWED_EMAILS: z.string().default(""),

  // --- Platform: YouTube (Google Cloud OAuth client, separate from app login) ---
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),

  // --- Platform: Meta (Instagram / Facebook) ---
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  // --- Platform: Threads (separate API; falls back to META creds if unset) ---
  THREADS_APP_ID: z.string().optional(),
  THREADS_APP_SECRET: z.string().optional(),

  // --- Platform: TikTok ---
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

/** Emails allowed to sign in, normalized to lowercase. */
export const allowedEmails = env.ALLOWED_EMAILS.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
