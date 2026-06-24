import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Platform } from "./db/schema";

/** Whitelisted sort metrics for the "top posts" view (prevents SQL injection). */
// Values are output-column aliases (see getTopPosts SELECT), safe for ORDER BY.
export const SORT_METRICS = {
  views: "views",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  engagement_rate: "engagement_rate",
} as const;
export type SortMetric = keyof typeof SORT_METRICS;

export interface TopPost {
  id: string;
  platform: Platform;
  displayName: string;
  caption: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  type: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

/**
 * Top posts in a window, ranked by the chosen metric. Uses a LATERAL join to
 * grab each post's most recent daily snapshot in a single query.
 */
export async function getTopPosts(opts: {
  sinceDays: number;
  metric: SortMetric;
  workspaceId: string;
  limit?: number;
}): Promise<TopPost[]> {
  const orderCol = SORT_METRICS[opts.metric] ?? SORT_METRICS.views;
  const limit = opts.limit ?? 20;
  const since = new Date();
  since.setDate(since.getDate() - opts.sinceDays);

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT p.id, p.caption, p.url, p.thumbnail_url, p.type, p.published_at,
           la.platform, la.display_name,
           -- Fall back to impressions when a platform reports no separate view
           -- count (e.g. X tweets, IG feed posts, where impressions are "views").
           COALESCE(NULLIF(m.views, 0), m.impressions, 0) AS views,
           COALESCE(m.likes, 0) AS likes,
           COALESCE(m.comments, 0) AS comments,
           COALESCE(m.shares, 0) AS shares,
           COALESCE(m.engagement_rate, 0) AS engagement_rate
    FROM posts p
    JOIN linked_accounts la ON la.id = p.linked_account_id
    LEFT JOIN LATERAL (
      SELECT * FROM metrics_daily md
      WHERE md.post_id = p.id
      ORDER BY md.date DESC
      LIMIT 1
    ) m ON true
    WHERE p.published_at >= ${since.toISOString()}
      AND la.workspace_id = ${opts.workspaceId}
    ORDER BY ${sql.raw(orderCol)} DESC NULLS LAST
    LIMIT ${limit}
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    platform: r.platform as Platform,
    displayName: String(r.display_name ?? ""),
    caption: (r.caption as string) ?? null,
    url: (r.url as string) ?? null,
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    type: (r.type as string) ?? null,
    publishedAt: r.published_at ? String(r.published_at) : null,
    views: Number(r.views),
    likes: Number(r.likes),
    comments: Number(r.comments),
    shares: Number(r.shares),
    engagementRate: Number(r.engagement_rate),
  }));
}

export interface PlatformOverview {
  platform: Platform;
  posts: number;
  views: number;
  engagement: number;
  followers: number;
  followerChange: number;
}

/**
 * Per-platform totals. Combines two sources so both per-post imports (YouTube,
 * etc.) and account-level daily exports (e.g. an X account-overview CSV with no
 * per-post rows) show meaningful numbers:
 *  - post metrics: each post's latest snapshot (lifetime views/engagement)
 *  - account metrics: daily impressions/engagement summed over the window, plus
 *    the latest follower total
 */
export async function getOverview(
  workspaceId: string,
  sinceDays: number,
): Promise<PlatformOverview[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceStr = since.toISOString().slice(0, 10);

  const postRows = await db.execute<Record<string, unknown>>(sql`
    WITH latest_post AS (
      SELECT DISTINCT ON (md.post_id) md.post_id, md.views, md.likes,
             md.comments, md.shares
      FROM metrics_daily md
      ORDER BY md.post_id, md.date DESC
    )
    SELECT la.platform,
           COUNT(DISTINCT p.id) AS posts,
           COALESCE(SUM(lp.views), 0) AS views,
           COALESCE(SUM(lp.likes + lp.comments + lp.shares), 0) AS engagement
    FROM linked_accounts la
    LEFT JOIN posts p ON p.linked_account_id = la.id
    LEFT JOIN latest_post lp ON lp.post_id = p.id
    WHERE la.workspace_id = ${workspaceId}
    GROUP BY la.platform
  `);

  // Account-level daily metrics summed over the window (per platform).
  const acctRows = await db.execute<Record<string, unknown>>(sql`
    SELECT la.platform,
           COALESCE(SUM(amd.views), 0) AS views,
           COALESCE(SUM(amd.engagement), 0) AS engagement,
           COALESCE(SUM(amd.follower_change), 0) AS follower_change
    FROM linked_accounts la
    JOIN account_metrics_daily amd ON amd.linked_account_id = la.id
    WHERE la.workspace_id = ${workspaceId} AND amd.date >= ${sinceStr}
    GROUP BY la.platform
  `);

  // Latest follower total per account, summed by platform (no window fan-out).
  const followerRows = await db.execute<Record<string, unknown>>(sql`
    WITH latest_follow AS (
      SELECT DISTINCT ON (amd.linked_account_id)
             amd.linked_account_id, amd.followers
      FROM account_metrics_daily amd
      ORDER BY amd.linked_account_id, amd.date DESC
    )
    SELECT la.platform, COALESCE(SUM(lf.followers), 0) AS followers
    FROM linked_accounts la
    JOIN latest_follow lf ON lf.linked_account_id = la.id
    WHERE la.workspace_id = ${workspaceId}
    GROUP BY la.platform
  `);

  const byPlatform = new Map<Platform, PlatformOverview>();
  for (const r of postRows as unknown as Record<string, unknown>[]) {
    byPlatform.set(r.platform as Platform, {
      platform: r.platform as Platform,
      posts: Number(r.posts),
      views: Number(r.views),
      engagement: Number(r.engagement),
      followers: 0,
      followerChange: 0,
    });
  }
  const ensure = (p: Platform): PlatformOverview => {
    let existing = byPlatform.get(p);
    if (!existing) {
      existing = {
        platform: p,
        posts: 0,
        views: 0,
        engagement: 0,
        followers: 0,
        followerChange: 0,
      };
      byPlatform.set(p, existing);
    }
    return existing;
  };

  for (const r of acctRows as unknown as Record<string, unknown>[]) {
    const o = ensure(r.platform as Platform);
    o.views += Number(r.views);
    o.engagement += Number(r.engagement);
    o.followerChange += Number(r.follower_change);
  }
  for (const r of followerRows as unknown as Record<string, unknown>[]) {
    ensure(r.platform as Platform).followers = Number(r.followers);
  }

  return [...byPlatform.values()];
}

export interface TrendPoint {
  date: string;
  followers: number;
  views: number;
  engagement: number;
}

/** Daily account-level trend across a workspace's accounts, for the overview chart. */
export async function getTrend(
  sinceDays: number,
  workspaceId: string,
): Promise<TrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT amd.date,
           COALESCE(SUM(amd.followers), 0) AS followers,
           COALESCE(SUM(amd.views), 0) AS views,
           COALESCE(SUM(amd.engagement), 0) AS engagement
    FROM account_metrics_daily amd
    JOIN linked_accounts la ON la.id = amd.linked_account_id
    WHERE amd.date >= ${since.toISOString().slice(0, 10)}
      AND la.workspace_id = ${workspaceId}
    GROUP BY amd.date
    ORDER BY amd.date ASC
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date),
    followers: Number(r.followers),
    views: Number(r.views),
    engagement: Number(r.engagement),
  }));
}
