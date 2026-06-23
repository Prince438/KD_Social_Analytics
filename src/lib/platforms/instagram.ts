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

/**
 * Instagram Business/Creator analytics via the Meta Graph API. Discovered
 * through the Facebook Pages a user manages; one linked account per connected
 * IG account. The stored token is the Page token used to query the IG node.
 */
export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  label: "Instagram",

  isConfigured: metaConfigured,

  getAuthUrl(state: string) {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("instagram");
    return metaAuthUrl("instagram", state);
  },

  async exchangeCode(code: string): Promise<AccountIdentity[]> {
    if (!this.isConfigured()) throw new PlatformNotConfiguredError("instagram");
    const { token } = await exchangeForLongLivedToken("instagram", code);
    const pages = await getManagedPages(token);

    return pages
      .filter((p) => p.instagram)
      .map((p) => ({
        platformAccountId: p.instagram!.id,
        displayName: `@${p.instagram!.username}`,
        avatarUrl: p.instagram!.profilePictureUrl,
        tokens: { accessToken: p.accessToken },
      }));
  },

  async refreshToken() {
    throw new Error("Instagram uses non-expiring Page tokens; reconnect to refresh.");
  },

  async fetchPosts(account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]> {
    const data = await graphGet<{
      data?: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        permalink?: string;
        thumbnail_url?: string;
        media_url?: string;
        timestamp?: string;
      }>;
    }>(`${account.platformAccountId}/media`, accessToken, {
      fields: "id,caption,media_type,permalink,thumbnail_url,media_url,timestamp",
      limit: "50",
    });

    return (data.data ?? []).map((m) => ({
      platformPostId: m.id,
      type: m.media_type?.toLowerCase(),
      caption: m.caption,
      url: m.permalink,
      thumbnailUrl: m.thumbnail_url ?? m.media_url,
      publishedAt: m.timestamp ? new Date(m.timestamp) : undefined,
    }));
  },

  async fetchPostMetrics(
    _account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]> {
    const metrics: NormalizedMetric[] = [];
    for (const mediaId of platformPostIds) {
      // like_count / comments_count are always available; insights vary by media
      // type, so fetch them separately and tolerate failures.
      let likes = 0;
      let comments = 0;
      try {
        const base = await graphGet<{
          like_count?: number;
          comments_count?: number;
        }>(mediaId, accessToken, { fields: "like_count,comments_count" });
        likes = base.like_count ?? 0;
        comments = base.comments_count ?? 0;
      } catch {
        // ignore
      }

      let reach = 0;
      let saves = 0;
      let shares = 0;
      try {
        const ins = await graphGet<{
          data?: Array<{ name: string; values: Array<{ value: number }> }>;
        }>(`${mediaId}/insights`, accessToken, { metric: "reach,saved,shares" });
        for (const d of ins.data ?? []) {
          const v = d.values?.[0]?.value ?? 0;
          if (d.name === "reach") reach = v;
          else if (d.name === "saved") saves = v;
          else if (d.name === "shares") shares = v;
        }
      } catch {
        // insights not available for this media type
      }

      metrics.push({
        platformPostId: mediaId,
        likes,
        comments,
        reach,
        saves,
        shares,
        impressions: reach,
      });
    }
    return metrics;
  },

  async fetchAccountMetrics(
    account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric> {
    const data = await graphGet<{ followers_count?: number }>(
      account.platformAccountId,
      accessToken,
      { fields: "followers_count,media_count" },
    );
    return { followers: data.followers_count ?? 0 };
  },
};
