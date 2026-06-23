import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { syncAll } from "@/lib/sync";

// Allow up to 5 minutes on platforms that support it (e.g. Vercel Pro).
export const maxDuration = 300;

/**
 * Runs the daily sync of all connected accounts.
 *
 * Authorized either by the Vercel Cron secret (Authorization: Bearer <CRON_SECRET>)
 * or by an authenticated dashboard session (the "Sync now" button).
 */
async function handle(req: Request) {
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${env.CRON_SECRET}`;
  const session = isCron ? null : await auth();

  if (!isCron && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAll();
  return NextResponse.json({ ok: result.failed === 0, ...result });
}

export async function POST(req: Request) {
  return handle(req);
}

// Vercel Cron triggers GET requests.
export async function GET(req: Request) {
  return handle(req);
}
