import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  date,
  doublePrecision,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * Supported social platforms. Adapters key off this enum.
 * X (Twitter) and LinkedIn are included for completeness but gated behind
 * paid/partner access — see the project plan.
 */
export const platformEnum = pgEnum("platform", [
  "youtube",
  "instagram",
  "facebook",
  "threads",
  "tiktok",
  "x",
  "linkedin",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "success",
  "error",
]);

/**
 * Workspaces let you isolate a client's accounts so they only see their own
 * data. Your own accounts can live in a default workspace.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A social account linked via OAuth. Tokens are stored encrypted (see
 * lib/crypto). One row per connected platform account.
 */
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    // How this account's data arrives: "oauth" (live API sync) or "manual"
    // (analytics files uploaded by the user). Manual accounts have no tokens.
    source: text("source").notNull().default("oauth"),
    // The platform's own id for this account (channel id, page id, etc.);
    // for manual accounts a synthesized "manual:<slug>" id.
    platformAccountId: text("platform_account_id").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    // Free-form platform-specific data (e.g. Meta page<->ig mapping).
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("linked_accounts_platform_acct_idx").on(
      t.platform,
      t.platformAccountId,
      t.workspaceId,
    ),
  ],
);

/** A single post/video/reel/tweet from a linked account. */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkedAccountId: uuid("linked_account_id")
      .notNull()
      .references(() => linkedAccounts.id, { onDelete: "cascade" }),
    platformPostId: text("platform_post_id").notNull(),
    // e.g. "video", "reel", "image", "carousel", "text"
    type: text("type"),
    caption: text("caption"),
    url: text("url"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_account_post_idx").on(
      t.linkedAccountId,
      t.platformPostId,
    ),
    index("posts_published_idx").on(t.publishedAt),
  ],
);

/**
 * Daily metric snapshot per post. One row per post per day lets us compute
 * weekly/monthly trends and "best post in period" without re-hitting the API.
 */
export const metricsDaily = pgTable(
  "metrics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    views: integer("views").default(0),
    likes: integer("likes").default(0),
    comments: integer("comments").default(0),
    shares: integer("shares").default(0),
    saves: integer("saves").default(0),
    reach: integer("reach").default(0),
    impressions: integer("impressions").default(0),
    engagementRate: doublePrecision("engagement_rate").default(0),
  },
  (t) => [
    uniqueIndex("metrics_daily_post_date_idx").on(t.postId, t.date),
    index("metrics_daily_date_idx").on(t.date),
  ],
);

/** Daily account-level metrics (followers etc.) for growth trends. */
export const accountMetricsDaily = pgTable(
  "account_metrics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkedAccountId: uuid("linked_account_id")
      .notNull()
      .references(() => linkedAccounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    followers: integer("followers").default(0),
    followerChange: integer("follower_change").default(0),
    views: integer("views").default(0),
    engagement: integer("engagement").default(0),
  },
  (t) => [
    uniqueIndex("account_metrics_daily_acct_date_idx").on(
      t.linkedAccountId,
      t.date,
    ),
  ],
);

/** Observability for each sync run, for debugging failed pulls. */
export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkedAccountId: uuid("linked_account_id").references(
    () => linkedAccounts.id,
    { onDelete: "cascade" },
  ),
  platform: platformEnum("platform").notNull(),
  status: syncStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  postsSynced: integer("posts_synced").default(0),
  error: text("error"),
});

export type LinkedAccount = typeof linkedAccounts.$inferSelect;
export type NewLinkedAccount = typeof linkedAccounts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type MetricDaily = typeof metricsDaily.$inferSelect;
export type Platform = (typeof platformEnum.enumValues)[number];
