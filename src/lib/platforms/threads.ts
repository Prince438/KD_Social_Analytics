import { env } from "../env";
import type { LinkedAccount } from "../db/schema";
import {
  PlatformNotConfiguredError,
  type AccountIdentity,
  type NormalizedAccountMetric,
  type NormalizedMetric,
  type NormalizedPost,
  type PlatformAdapter,
  type TokenSet,
} from "./types";

/**
 * Threads analytics via the Threads API (graph.threads.net) — a separate
 * surface from the Facebook Graph API, with its own OAuth and refreshable
 * long-lived tokens. Credentials fall back to the Meta app if unset.
 */
const BASE = "https://graph.threads.net/v1.0";

function clientId() {
  return env.THREADS_APP_ID ?? env.META_APP_ID;
}
function clientSecret() {
  return env.THREADS_APP_SECRET ?? env.META_APP_SECRET;
}
function redirectUri() {
  return `${env.APP_URL}/api/connect/threads/callback`;
}

async function threadsGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Threads API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const threadsAdapter: PlatformAdapter = {
  platform: "threads",
  label: "Threads",

  isConfigured() {
    return Boolean(clientId() && clientSecret());
  },

  getAuthUrl(state: string) {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("threads");
    const params = new URLSearchParams({
      client_id: clientId()!,
      redirect_uri: redirectUri(),
      scope: "threads_basic,threads_manage_insights",
      response_type: "code",
      state,
    });
    return `https://threads.net/oauth/authorize?${params}`;
  },

  async exchangeCode(code: string): Promise<AccountIdentity> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("threads");

    // 1) code -> short-lived token
    const shortRes = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId()!,
        client_secret: clientSecret()!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(),
        code,
      }),
    });
    if (!shortRes.ok)
      throw new Error(`Threads token exchange failed: ${await shortRes.text()}`);
    const short = (await shortRes.json()) as { access_token: string };

    // 2) short-lived -> long-lived (~60 days)
    const longRes = await fetch(
      `https://graph.threads.net/access_token?${new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: clientSecret()!,
        access_token: short.access_token,
      })}`,
    );
    if (!longRes.ok)
      throw new Error(`Threads long-lived exchange failed: ${await longRes.text()}`);
    const long = (await longRes.json()) as {
      access_token: string;
      expires_in?: number;
    };

    const me = await threadsGet<{
      id: string;
      username?: string;
      threads_profile_picture_url?: string;
    }>("me", long.access_token, {
      fields: "id,username,threads_profile_picture_url",
    });

    return {
      platformAccountId: me.id,
      displayName: me.username ? `@${me.username}` : me.id,
      avatarUrl: me.threads_profile_picture_url,
      tokens: {
        accessToken: long.access_token,
        // Stored as the "refresh token" so the sync engine can re-extend it.
        refreshToken: long.access_token,
        expiresAt: long.expires_in
          ? new Date(Date.now() + long.expires_in * 1000)
          : undefined,
      },
    };
  },

  async refreshToken(currentToken: string): Promise<TokenSet> {
    const res = await fetch(
      `https://graph.threads.net/refresh_access_token?${new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: currentToken,
      })}`,
    );
    if (!res.ok) throw new Error(`Threads token refresh failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    };
  },

  async fetchPosts(account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]> {
    const data = await threadsGet<{
      data?: Array<{
        id: string;
        text?: string;
        permalink?: string;
        timestamp?: string;
        media_type?: string;
        thumbnail_url?: string;
      }>;
    }>(`${account.platformAccountId}/threads`, accessToken, {
      fields: "id,text,permalink,timestamp,media_type,thumbnail_url",
      limit: "50",
    });

    return (data.data ?? []).map((t) => ({
      platformPostId: t.id,
      type: t.media_type?.toLowerCase() ?? "text",
      caption: t.text,
      url: t.permalink,
      thumbnailUrl: t.thumbnail_url,
      publishedAt: t.timestamp ? new Date(t.timestamp) : undefined,
    }));
  },

  async fetchPostMetrics(
    _account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = [];
    for (const id of platformPostIds) {
      try {
        const ins = await threadsGet<{
          data?: Array<{ name: string; values?: Array<{ value: number }> }>;
        }>(`${id}/insights`, accessToken, {
          metric: "views,likes,replies,reposts,quotes",
        });
        const val = (name: string) =>
          ins.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

        metrics.push({
          platformPostId: id,
          views: val("views"),
          impressions: val("views"),
          likes: val("likes"),
          comments: val("replies"),
          shares: val("reposts") + val("quotes"),
        });
      } catch {
        metrics.push({ platformPostId: id });
      }
    }
    return metrics;
  },

  async fetchAccountMetrics(
    account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric> {
    try {
      const ins = await threadsGet<{
        data?: Array<{
          name: string;
          total_value?: { value: number };
          values?: Array<{ value: number }>;
        }>;
      }>(`${account.platformAccountId}/threads_insights`, accessToken, {
        metric: "followers_count",
      });
      const f = ins.data?.find((d) => d.name === "followers_count");
      return { followers: f?.total_value?.value ?? f?.values?.[0]?.value ?? 0 };
    } catch {
      return { followers: 0 };
    }
  },
};
