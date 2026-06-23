import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { getAdapter } from "@/lib/platforms";
import { getActiveWorkspaceId } from "@/lib/workspace";
import type { Platform } from "@/lib/db/schema";

/** Starts the OAuth flow for a platform: sets a state cookie, redirects to consent. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform } = await params;
  const adapter = getAdapter(platform as Platform);
  if (!adapter || !adapter.isConfigured()) {
    return NextResponse.json(
      { error: `Platform "${platform}" is not available` },
      { status: 400 },
    );
  }

  const workspaceId = await getActiveWorkspaceId();
  const nonce = crypto.randomBytes(16).toString("hex");
  // State carries the workspace + a CSRF nonce we also store in a cookie.
  const state = `${nonce}.${workspaceId}`;

  const jar = await cookies();
  jar.set(`oauth_state_${platform}`, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(adapter.getAuthUrl(state));
}
