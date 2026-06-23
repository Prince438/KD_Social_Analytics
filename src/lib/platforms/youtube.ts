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

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

function redirectUri() {
  return `${env.APP_URL}/api/connect/youtube/callback`;
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",
  label: "YouTube",

  isConfigured() {
    return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
  },

  getAuthUrl(state: string) {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("youtube");
    const params = new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code: string): Promise<AccountIdentity> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("youtube");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.YOUTUBE_CLIENT_ID!,
        client_secret: env.YOUTUBE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`YouTube token exchange failed: ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const tokens: TokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };

    // Fetch channel identity.
    const channels = await googleJson<{
      items?: Array<{
        id: string;
        snippet: { title: string; thumbnails?: { default?: { url?: string } } };
      }>;
    }>(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      tokens.accessToken,
    );
    const channel = channels.items?.[0];
    if (!channel) throw new Error("No YouTube channel found for this account");

    return {
      platformAccountId: channel.id,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
      tokens,
    };
  },

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("youtube");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.YOUTUBE_CLIENT_ID!,
        client_secret: env.YOUTUBE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`YouTube token refresh failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      // Google does not return a new refresh token on refresh; caller keeps the old one.
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async fetchPosts(account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]> {
    // Uploads live in a special "uploads" playlist derived from the channel id.
    // UC... channel id -> UU... uploads playlist id.
    const uploadsPlaylist = "UU" + account.platformAccountId.slice(2);
    const posts: NormalizedPost[] = [];
    let pageToken: string | undefined;

    // Cap at a few pages to stay within quota; daily sync keeps it fresh.
    for (let page = 0; page < 3; page++) {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("playlistId", uploadsPlaylist);
      url.searchParams.set("maxResults", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const data = await googleJson<{
        nextPageToken?: string;
        items?: Array<{
          contentDetails: { videoId: string; videoPublishedAt?: string };
          snippet: {
            title: string;
            description?: string;
            thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
          };
        }>;
      }>(url.toString(), accessToken);

      for (const item of data.items ?? []) {
        const videoId = item.contentDetails.videoId;
        posts.push({
          platformPostId: videoId,
          type: "video",
          caption: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl:
            item.snippet.thumbnails?.medium?.url ??
            item.snippet.thumbnails?.default?.url,
          publishedAt: item.contentDetails.videoPublishedAt
            ? new Date(item.contentDetails.videoPublishedAt)
            : undefined,
        });
      }

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    return posts;
  },

  async fetchPostMetrics(
    _account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = [];
    // videos.list accepts up to 50 ids per call.
    for (let i = 0; i < platformPostIds.length; i += 50) {
      const batch = platformPostIds.slice(i, i + 50);
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "statistics");
      url.searchParams.set("id", batch.join(","));

      const data = await googleJson<{
        items?: Array<{
          id: string;
          statistics: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
          };
        }>;
      }>(url.toString(), accessToken);

      for (const item of data.items ?? []) {
        metrics.push({
          platformPostId: item.id,
          views: Number(item.statistics.viewCount ?? 0),
          likes: Number(item.statistics.likeCount ?? 0),
          comments: Number(item.statistics.commentCount ?? 0),
        });
      }
    }
    return metrics;
  },

  async fetchAccountMetrics(
    account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric> {
    const data = await googleJson<{
      items?: Array<{
        statistics: {
          subscriberCount?: string;
          viewCount?: string;
        };
      }>;
    }>(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${account.platformAccountId}`,
      accessToken,
    );
    const stats = data.items?.[0]?.statistics;
    return {
      followers: Number(stats?.subscriberCount ?? 0),
      views: Number(stats?.viewCount ?? 0),
    };
  },
};
