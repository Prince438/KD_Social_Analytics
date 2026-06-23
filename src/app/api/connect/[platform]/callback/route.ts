import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { linkedAccounts, type Platform } from "@/lib/db/schema";
import { getAdapter } from "@/lib/platforms";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

/** OAuth callback: validates state, exchanges code, stores the linked account. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.redirect(new URL("/login", env.APP_URL));

  const { platform } = await params;
  const adapter = getAdapter(platform as Platform);
  if (!adapter) {
    return NextResponse.redirect(new URL("/connections?error=unknown_platform", env.APP_URL));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(oauthError)}`, env.APP_URL),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/connections?error=missing_code", env.APP_URL));
  }

  // Validate CSRF nonce from the state cookie.
  const [nonce, workspaceId] = state.split(".");
  const jar = await cookies();
  const cookieNonce = jar.get(`oauth_state_${platform}`)?.value;
  if (!cookieNonce || cookieNonce !== nonce || !workspaceId) {
    return NextResponse.redirect(new URL("/connections?error=bad_state", env.APP_URL));
  }
  jar.delete(`oauth_state_${platform}`);

  try {
    const result = await adapter.exchangeCode(code);
    const identities = Array.isArray(result) ? result : [result];

    if (identities.length === 0) {
      return NextResponse.redirect(
        new URL("/connections?error=no_accounts_found", env.APP_URL),
      );
    }

    for (const identity of identities) {
      await db
        .insert(linkedAccounts)
        .values({
          workspaceId,
          platform: adapter.platform,
          platformAccountId: identity.platformAccountId,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          accessTokenEnc: encrypt(identity.tokens.accessToken),
          refreshTokenEnc: identity.tokens.refreshToken
            ? encrypt(identity.tokens.refreshToken)
            : null,
          tokenExpiresAt: identity.tokens.expiresAt ?? null,
          metadata: identity.metadata ? JSON.stringify(identity.metadata) : null,
        })
        .onConflictDoUpdate({
          target: [
            linkedAccounts.platform,
            linkedAccounts.platformAccountId,
            linkedAccounts.workspaceId,
          ],
          set: {
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            accessTokenEnc: encrypt(identity.tokens.accessToken),
            refreshTokenEnc: identity.tokens.refreshToken
              ? encrypt(identity.tokens.refreshToken)
              : null,
            tokenExpiresAt: identity.tokens.expiresAt ?? null,
            metadata: identity.metadata ? JSON.stringify(identity.metadata) : null,
          },
        });
    }

    return NextResponse.redirect(
      new URL(`/connections?connected=${identities.length}`, env.APP_URL),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "connect_failed";
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, env.APP_URL),
    );
  }
}
