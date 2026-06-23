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
 * TikTok analytics via the Login Kit + Display API. This is the most attainable
 * surface (no Business API approval) and exposes per-video stats + follower
 * count. Access tokens expire (~24h) and refresh tokens rotate, so the sync
 * engine refreshes them using the stored refresh token.
 */
const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "user.info.stats", "video.list"];

function redirectUri() {
  return `${env.APP_URL}/api/connect/tiktok/callback`;
}

/** POST/GET a TikTok endpoint, unwrapping its `{ data, error }` envelope. */
async function tiktok<T>(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as { data?: T; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error && json.error.code && json.error.code !== "ok")) {
    throw new Error(`TikTok API ${res.status}: ${json.error?.message ?? "unknown error"}`);
  }
  return json.data as T;
}

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
}

async function requestToken(
  params: Record<string, string>,
): Promise<TikTokTokenResponse> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY!,
      client_secret: env.TIKTOK_CLIENT_SECRET!,
      ...params,
    }),
  });
  const json = (await res.json()) as TikTokTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || json.error) {
    throw new Error(`TikTok token request failed: ${json.error_description ?? json.error}`);
  }
  return json;
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",
  label: "TikTok",

  isConfigured() {
    return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
  },

  getAuthUrl(state: string) {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("tiktok");
    const params = new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY!,
      scope: SCOPES.join(","),
      response_type: "code",
      redirect_uri: redirectUri(),
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  },

  async exchangeCode(code: string): Promise<AccountIdentity> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("tiktok");
    const token = await requestToken({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    });

    const { user } = await tiktok<{
      user: { open_id: string; display_name?: string; avatar_url?: string };
    }>("user/info/?fields=open_id,display_name,avatar_url", token.access_token);

    return {
      platformAccountId: token.open_id,
      displayName: user.display_name ?? token.open_id,
      avatarUrl: user.avatar_url,
      tokens: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
      },
    };
  },

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const token = await requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return {
      accessToken: token.access_token,
      // TikTok rotates the refresh token on each refresh.
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  },

  async fetchPosts(_account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]> {
    const posts: NormalizedPost[] = [];
    let cursor: number | undefined;

    // Cap a few pages of 20 to stay within rate limits; daily sync keeps it fresh.
    for (let page = 0; page < 3; page++) {
      const data = await tiktok<{
        videos?: Array<{
          id: string;
          title?: string;
          video_description?: string;
          create_time?: number;
          cover_image_url?: string;
          share_url?: string;
        }>;
        cursor?: number;
        has_more?: boolean;
      }>(
        "video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url",
        accessToken,
        { method: "POST", body: { max_count: 20, ...(cursor ? { cursor } : {}) } },
      );

      for (const v of data.videos ?? []) {
        posts.push({
          platformPostId: v.id,
          type: "video",
          caption: v.title || v.video_description,
          url: v.share_url,
          thumbnailUrl: v.cover_image_url,
          publishedAt: v.create_time ? new Date(v.create_time * 1000) : undefined,
        });
      }

      if (!data.has_more) break;
      cursor = data.cursor;
    }

    return posts;
  },

  async fetchPostMetrics(
    _account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = [];
    // video/query accepts up to 20 ids per call.
    for (let i = 0; i < platformPostIds.length; i += 20) {
      const batch = platformPostIds.slice(i, i + 20);
      const data = await tiktok<{
        videos?: Array<{
          id: string;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
        }>;
      }>(
        "video/query/?fields=id,view_count,like_count,comment_count,share_count",
        accessToken,
        { method: "POST", body: { filters: { video_ids: batch } } },
      );

      for (const v of data.videos ?? []) {
        metrics.push({
          platformPostId: v.id,
          views: v.view_count ?? 0,
          likes: v.like_count ?? 0,
          comments: v.comment_count ?? 0,
          shares: v.share_count ?? 0,
        });
      }
    }
    return metrics;
  },

  async fetchAccountMetrics(
    _account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric> {
    const { user } = await tiktok<{
      user: { follower_count?: number; likes_count?: number; video_count?: number };
    }>("user/info/?fields=follower_count,likes_count,video_count", accessToken);

    return {
      followers: user.follower_count ?? 0,
      engagement: user.likes_count ?? 0,
    };
  },
};
