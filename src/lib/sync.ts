import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  linkedAccounts,
  posts,
  metricsDaily,
  accountMetricsDaily,
  syncRuns,
  type LinkedAccount,
} from "./db/schema";
import { decrypt, encrypt } from "./crypto";
import { getAdapter } from "./platforms";
import type { PlatformAdapter } from "./platforms/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Ensures we have a non-expired access token, refreshing + persisting if needed. */
async function ensureAccessToken(
  account: LinkedAccount,
  adapter: PlatformAdapter,
): Promise<string> {
  if (!account.accessTokenEnc) {
    throw new Error("Account has no access token (manual upload account)");
  }
  let accessToken = decrypt(account.accessTokenEnc);
  const expiringSoon =
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() < Date.now() + 60_000;

  if (expiringSoon && account.refreshTokenEnc) {
    const refreshed = await adapter.refreshToken(decrypt(account.refreshTokenEnc));
    accessToken = refreshed.accessToken;
    await db
      .update(linkedAccounts)
      .set({
        accessTokenEnc: encrypt(refreshed.accessToken),
        tokenExpiresAt: refreshed.expiresAt ?? null,
        // Google keeps the same refresh token across refreshes.
        refreshTokenEnc: refreshed.refreshToken
          ? encrypt(refreshed.refreshToken)
          : account.refreshTokenEnc,
      })
      .where(eq(linkedAccounts.id, account.id));
  }
  return accessToken;
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

/** Syncs a single linked account: posts + metrics + account metrics. */
export async function syncAccount(account: LinkedAccount): Promise<number> {
  const adapter = getAdapter(account.platform);
  if (!adapter || !adapter.isConfigured()) {
    throw new Error(`No configured adapter for ${account.platform}`);
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ linkedAccountId: account.id, platform: account.platform })
    .returning({ id: syncRuns.id });

  try {
    const accessToken = await ensureAccessToken(account, adapter);

    // 1) Posts — upsert and build platformPostId -> internal id map.
    const fetchedPosts = await adapter.fetchPosts(account, accessToken);
    const idMap = new Map<string, string>();
    for (const p of fetchedPosts) {
      const [row] = await db
        .insert(posts)
        .values({
          linkedAccountId: account.id,
          platformPostId: p.platformPostId,
          type: p.type,
          caption: p.caption,
          url: p.url,
          thumbnailUrl: p.thumbnailUrl,
          publishedAt: p.publishedAt,
        })
        .onConflictDoUpdate({
          target: [posts.linkedAccountId, posts.platformPostId],
          set: { caption: p.caption, thumbnailUrl: p.thumbnailUrl },
        })
        .returning({ id: posts.id });
      idMap.set(p.platformPostId, row.id);
    }

    // 2) Per-post metrics for today's snapshot.
    const metrics = await adapter.fetchPostMetrics(
      account,
      accessToken,
      fetchedPosts.map((p) => p.platformPostId),
    );
    const date = today();
    for (const m of metrics) {
      const postId = idMap.get(m.platformPostId);
      if (!postId) continue;
      await db
        .insert(metricsDaily)
        .values({
          postId,
          date,
          views: m.views ?? 0,
          likes: m.likes ?? 0,
          comments: m.comments ?? 0,
          shares: m.shares ?? 0,
          saves: m.saves ?? 0,
          reach: m.reach ?? 0,
          impressions: m.impressions ?? 0,
          engagementRate: engagementRate(m),
        })
        .onConflictDoUpdate({
          target: [metricsDaily.postId, metricsDaily.date],
          set: {
            views: m.views ?? 0,
            likes: m.likes ?? 0,
            comments: m.comments ?? 0,
            shares: m.shares ?? 0,
            saves: m.saves ?? 0,
            reach: m.reach ?? 0,
            impressions: m.impressions ?? 0,
            engagementRate: engagementRate(m),
          },
        });
    }

    // 3) Account-level snapshot.
    const acct = await adapter.fetchAccountMetrics(account, accessToken);
    await db
      .insert(accountMetricsDaily)
      .values({
        linkedAccountId: account.id,
        date,
        followers: acct.followers ?? 0,
        views: acct.views ?? 0,
        engagement: acct.engagement ?? 0,
      })
      .onConflictDoUpdate({
        target: [accountMetricsDaily.linkedAccountId, accountMetricsDaily.date],
        set: {
          followers: acct.followers ?? 0,
          views: acct.views ?? 0,
          engagement: acct.engagement ?? 0,
        },
      });

    await db
      .update(linkedAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(linkedAccounts.id, account.id));

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        postsSynced: fetchedPosts.length,
      })
      .where(eq(syncRuns.id, run.id));

    return fetchedPosts.length;
  } catch (err) {
    await db
      .update(syncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncRuns.id, run.id));
    throw err;
  }
}

/** Syncs every linked account whose platform adapter is configured. */
export async function syncAll(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  // Only OAuth accounts sync from APIs; manual upload accounts are skipped.
  const accounts = await db
    .select()
    .from(linkedAccounts)
    .where(eq(linkedAccounts.source, "oauth"));
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      await syncAccount(account);
      synced++;
    } catch (err) {
      failed++;
      errors.push(
        `${account.platform}/${account.displayName}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { synced, failed, errors };
}
