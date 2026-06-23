import type { LinkedAccount } from "../db/schema";
import {
  PlatformNotConfiguredError,
  type AccountIdentity,
  type NormalizedAccountMetric,
  type NormalizedMetric,
  type NormalizedPost,
  type PlatformAdapter,
} from "./types";
import {
  exchangeForLongLivedToken,
  getManagedPages,
  graphGet,
  metaAuthUrl,
  metaConfigured,
} from "./meta-common";

/** Facebook Pages analytics via the Meta Graph API. One linked account per Page. */
export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  label: "Facebook",

  isConfigured: metaConfigured,

  getAuthUrl(state: string) {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("facebook");
    return metaAuthUrl("facebook", state);
  },

  async exchangeCode(code: string): Promise<AccountIdentity[]> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("facebook");
    const { token } = await exchangeForLongLivedToken("facebook", code);
    const pages = await getManagedPages(token);

    // Each managed Page becomes its own linked account. Page tokens derived
    // from a long-lived user token do not expire, so no refresh token needed.
    return pages.map((p) => ({
      platformAccountId: p.id,
      displayName: p.name,
      tokens: { accessToken: p.accessToken },
    }));
  },

  async refreshToken() {
    // Page tokens don't expire; if access is lost the user reconnects.
    throw new Error("Facebook Page tokens are non-expiring; reconnect to refresh.");
  },

  async fetchPosts(account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]> {
    const data = await graphGet<{
      data?: Array<{
        id: string;
        message?: string;
        created_time: string;
        permalink_url?: string;
        full_picture?: string;
      }>;
    }>(`${account.platformAccountId}/posts`, accessToken, {
      fields: "id,message,created_time,permalink_url,full_picture",
      limit: "50",
    });

    return (data.data ?? []).map((p) => ({
      platformPostId: p.id,
      type: "post",
      caption: p.message,
      url: p.permalink_url,
      thumbnailUrl: p.full_picture,
      publishedAt: p.created_time ? new Date(p.created_time) : undefined,
    }));
  },

  async fetchPostMetrics(
    _account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = [];
    for (const postId of platformPostIds) {
      try {
        const p = await graphGet<{
          likes?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          shares?: { count?: number };
          insights?: {
            data?: Array<{ name: string; values: Array<{ value: number }> }>;
          };
        }>(postId, accessToken, {
          fields:
            "likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_impressions_unique)",
        });

        const insight = (name: string) =>
          p.insights?.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

        metrics.push({
          platformPostId: postId,
          likes: p.likes?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          shares: p.shares?.count ?? 0,
          impressions: insight("post_impressions"),
          reach: insight("post_impressions_unique"),
        });
      } catch {
        // Insights can be unavailable for some posts; record zeros rather than failing the sync.
        metrics.push({ platformPostId: postId });
      }
    }
    return metrics;
  },

  async fetchAccountMetrics(
    account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric> {
    const data = await graphGet<{
      followers_count?: number;
      fan_count?: number;
    }>(account.platformAccountId, accessToken, {
      fields: "followers_count,fan_count",
    });
    return { followers: data.followers_count ?? data.fan_count ?? 0 };
  },
};
