import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  linkedAccounts,
  posts,
  metricsDaily,
  accountMetricsDaily,
  type Platform,
} from "../db/schema";
import { parseFile } from "./parse";
import { detectMapping, applyMapping, type FieldMapping } from "./mapping";
import type { ImportKind } from "./fields";

/** Local YYYY-MM-DD (avoids the UTC shift that toISOString causes for dates). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const today = () => localDateStr(new Date());

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
}

function engagementRate(m: {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  impressions?: number;
}): number {
  const interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
  const base = m.views || m.impressions || 0;
  return base > 0 ? interactions / base : 0;
}

/** Find-or-create the manual (upload) account for a platform + name in a workspace. */
async function getOrCreateManualAccount(
  workspaceId: string,
  platform: Platform,
  accountName: string,
): Promise<string> {
  const platformAccountId = `manual:${slugify(accountName)}`;
  const existing = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.workspaceId, workspaceId),
        eq(linkedAccounts.platform, platform),
        eq(linkedAccounts.platformAccountId, platformAccountId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(linkedAccounts)
      .set({ lastSyncedAt: new Date(), displayName: accountName })
      .where(eq(linkedAccounts.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(linkedAccounts)
    .values({
      workspaceId,
      platform,
      source: "manual",
      platformAccountId,
      displayName: accountName,
      lastSyncedAt: new Date(),
    })
    .returning({ id: linkedAccounts.id });
  return created.id;
}

export interface ImportSummary {
  kind: "posts" | "account";
  rowsImported: number;
  mapping: Record<string, string>;
  unmappedColumns: string[];
  accountId: string;
}

/**
 * Parses an uploaded analytics export and imports it as a manual account's
 * posts (or account-level follower snapshots). Idempotent: re-uploading the
 * same export updates the existing rows.
 */
export async function importAnalyticsFile(opts: {
  filename: string;
  buffer: ArrayBuffer;
  platform: Platform;
  accountName: string;
  workspaceId: string;
  /** Optional explicit mapping from the review step; auto-detected if omitted. */
  kind?: ImportKind;
  mapping?: FieldMapping;
}): Promise<ImportSummary> {
  const table = await parseFile(opts.filename, opts.buffer);
  if (table.headers.length === 0 || table.rows.length === 0) {
    throw new Error("Could not read any rows from the file.");
  }

  // Use the user-confirmed mapping if provided, else auto-detect.
  const detected =
    opts.kind && opts.mapping
      ? {
          kind: opts.kind,
          mapping: opts.mapping,
          unmappedColumns: table.headers.filter(
            (h) => !Object.values(opts.mapping!).includes(h),
          ),
        }
      : detectMapping(table);
  const applied = applyMapping(table, detected.kind, detected.mapping);
  const mapped = { ...detected, ...applied };

  const accountId = await getOrCreateManualAccount(
    opts.workspaceId,
    opts.platform,
    opts.accountName,
  );
  const date = today();

  if (mapped.kind === "posts") {
    if (mapped.posts.length === 0) {
      throw new Error("No post rows could be mapped from this file.");
    }
    for (const { post, metric } of mapped.posts) {
      const [row] = await db
        .insert(posts)
        .values({
          linkedAccountId: accountId,
          platformPostId: post.platformPostId,
          type: post.type,
          caption: post.caption,
          url: post.url,
          thumbnailUrl: post.thumbnailUrl,
          publishedAt: post.publishedAt,
        })
        .onConflictDoUpdate({
          target: [posts.linkedAccountId, posts.platformPostId],
          set: { caption: post.caption, url: post.url, publishedAt: post.publishedAt },
        })
        .returning({ id: posts.id });

      await db
        .insert(metricsDaily)
        .values({
          postId: row.id,
          date,
          views: metric.views ?? 0,
          likes: metric.likes ?? 0,
          comments: metric.comments ?? 0,
          shares: metric.shares ?? 0,
          saves: metric.saves ?? 0,
          reach: metric.reach ?? 0,
          impressions: metric.impressions ?? 0,
          engagementRate: engagementRate(metric),
        })
        .onConflictDoUpdate({
          target: [metricsDaily.postId, metricsDaily.date],
          set: {
            views: metric.views ?? 0,
            likes: metric.likes ?? 0,
            comments: metric.comments ?? 0,
            shares: metric.shares ?? 0,
            saves: metric.saves ?? 0,
            reach: metric.reach ?? 0,
            impressions: metric.impressions ?? 0,
            engagementRate: engagementRate(metric),
          },
        });
    }

    return {
      kind: "posts",
      rowsImported: mapped.posts.length,
      mapping: mapped.mapping,
      unmappedColumns: mapped.unmappedColumns,
      accountId,
    };
  }

  // Account-level follower time series.
  if (mapped.account.length === 0) {
    throw new Error("No usable rows found. Expected per-post or follower data.");
  }
  for (const row of mapped.account) {
    const rowDate = localDateStr(row.date ?? new Date());
    const values = {
      followers: row.followers,
      followerChange: row.followerChange,
      views: row.views,
      engagement: row.engagement,
    };
    await db
      .insert(accountMetricsDaily)
      .values({ linkedAccountId: accountId, date: rowDate, ...values })
      .onConflictDoUpdate({
        target: [accountMetricsDaily.linkedAccountId, accountMetricsDaily.date],
        set: values,
      });
  }

  return {
    kind: "account",
    rowsImported: mapped.account.length,
    mapping: mapped.mapping,
    unmappedColumns: mapped.unmappedColumns,
    accountId,
  };
}
