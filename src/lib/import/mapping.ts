import type { NormalizedMetric, NormalizedPost } from "../platforms/types";
import type { ParsedTable } from "./parse";
import {
  POST_FIELDS,
  ACCOUNT_FIELDS,
  type PostField,
  type AccountField,
  type ImportKind,
} from "./fields";

/**
 * Maps a platform's exported analytics columns onto our normalized fields.
 *
 * Every platform exports a different CSV/XLSX schema (and they change over
 * time), so rather than hard-coding per-platform layouts we detect columns by
 * matching their headers against a synonym list. This handles YouTube Studio,
 * Meta/Instagram, TikTok and most others without per-platform code — and the
 * user can correct the detected mapping before importing.
 */

// Synonyms in priority order. Matching prefers exact header equality, then
// "starts with", then "contains" (all on normalized lowercase headers).
const POST_SYNONYMS: Record<PostField, string[]> = {
  postId: ["post id", "video id", "media id", "content id", "id"],
  caption: ["video title", "post title", "title", "caption", "description"],
  url: ["permalink", "url", "video link", "share url", "link"],
  publishedAt: [
    "video publish time",
    "publish time",
    "post time",
    "publish date",
    "date published",
    "created",
    "published",
    "date",
    "time",
  ],
  views: ["video views", "total views", "views", "plays", "play count"],
  likes: ["total likes", "likes", "reactions", "like count"],
  comments: ["comments added", "total comments", "comments", "replies", "comment count"],
  shares: ["total shares", "shares", "reposts", "share count"],
  saves: ["saves", "saved", "bookmarks"],
  reach: ["accounts reached", "reach"],
  impressions: ["impressions"],
};

const ACCOUNT_SYNONYMS: Record<AccountField, string[]> = {
  date: ["date", "day", "time"],
  followers: ["followers", "follower count", "subscribers", "total followers"],
  followerChange: ["new follows", "net follows", "new followers", "follower change", "follows"],
  views: ["impressions", "video views", "views", "media views", "reach"],
  engagement: ["engagements", "total engagements", "engagement", "interactions"],
};

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Score how well a header matches a synonym, on whole-word boundaries so short
 * tokens like "id" don't match inside "video", and "post" doesn't match "post
 * time". Higher = better; 0 = no match.
 */
function matchScore(header: string, synonym: string): number {
  if (header === synonym) return 3;
  if (header.startsWith(`${synonym} `)) return 2;
  if (` ${header} `.includes(` ${synonym} `)) return 1;
  return 0;
}

/** Picks the best header for each field, never assigning one header twice. */
function detectColumns<F extends string>(
  headers: string[],
  synonyms: Record<F, string[]>,
): Partial<Record<F, string>> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  const used = new Set<string>();
  const mapping: Partial<Record<F, string>> = {};

  for (const field of Object.keys(synonyms) as F[]) {
    let best: { raw: string; score: number } | null = null;
    for (const { raw, norm } of normalized) {
      if (used.has(raw)) continue;
      let score = 0;
      // Earlier synonyms weigh more so "views" beats "impressions" for `views`.
      synonyms[field].forEach((syn, i) => {
        const s = matchScore(norm, normalize(syn)) * 10 - i;
        if (s > score) score = s;
      });
      if (score > 0 && (!best || score > best.score)) best = { raw, score };
    }
    if (best) {
      mapping[field] = best.raw;
      used.add(best.raw);
    }
  }
  return mapping;
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/[, ]/g, "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Stable id for a row lacking an explicit post id (so re-imports are idempotent). */
function syntheticId(caption: string, published: string): string {
  let hash = 0;
  const s = `${caption}|${published}`;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return `import-${(hash >>> 0).toString(36)}`;
}

export interface PostImportRow {
  post: NormalizedPost;
  metric: NormalizedMetric;
}

export interface AccountImportRow {
  date?: Date;
  followers: number;
  followerChange: number;
  views: number;
  engagement: number;
}

/** Field -> header column name. */
export type FieldMapping = Record<string, string>;

export interface DetectedMapping {
  kind: ImportKind;
  mapping: FieldMapping;
  unmappedColumns: string[];
}

/** Auto-detects the import kind and a field -> column mapping (no row transform). */
export function detectMapping(table: ParsedTable): DetectedMapping {
  const postCols = detectColumns(table.headers, POST_SYNONYMS);
  const hasPostIdentity = Boolean(postCols.caption || postCols.url || postCols.postId);

  const mapping = (hasPostIdentity
    ? postCols
    : detectColumns(table.headers, ACCOUNT_SYNONYMS)) as FieldMapping;

  return {
    kind: hasPostIdentity ? "posts" : "account",
    mapping,
    unmappedColumns: table.headers.filter((h) => !Object.values(mapping).includes(h)),
  };
}

/** Drops mapped fields whose column isn't present in the table headers. */
function sanitize(table: ParsedTable, mapping: FieldMapping): FieldMapping {
  const out: FieldMapping = {};
  for (const [field, col] of Object.entries(mapping)) {
    if (col && table.headers.includes(col)) out[field] = col;
  }
  return out;
}

export interface AppliedMapping {
  posts: PostImportRow[];
  account: AccountImportRow[];
}

/** Transforms rows using an explicit field -> column mapping for the given kind. */
export function applyMapping(
  table: ParsedTable,
  kind: ImportKind,
  rawMapping: FieldMapping,
): AppliedMapping {
  const m = sanitize(table, rawMapping);
  const get = (row: Record<string, string>, field: string) =>
    m[field] ? row[m[field]] : undefined;

  if (kind === "posts") {
    const posts: PostImportRow[] = table.rows.map((row, i) => {
      const caption = get(row, "caption");
      const publishedRaw = get(row, "publishedAt") ?? "";
      const explicitId = get(row, "postId");
      const platformPostId =
        explicitId?.trim() || syntheticId(caption ?? `row${i}`, publishedRaw);

      return {
        post: {
          platformPostId,
          caption: caption?.trim() || undefined,
          url: get(row, "url"),
          publishedAt: toDate(publishedRaw),
        },
        metric: {
          platformPostId,
          views: toNumber(get(row, "views")),
          likes: toNumber(get(row, "likes")),
          comments: toNumber(get(row, "comments")),
          shares: toNumber(get(row, "shares")),
          saves: toNumber(get(row, "saves")),
          reach: toNumber(get(row, "reach")),
          impressions: toNumber(get(row, "impressions")),
        },
      };
    });
    return { posts, account: [] };
  }

  const account: AccountImportRow[] = table.rows
    .map((row) => ({
      date: toDate(get(row, "date")),
      followers: toNumber(get(row, "followers")),
      followerChange: toNumber(get(row, "followerChange")),
      views: toNumber(get(row, "views")),
      engagement: toNumber(get(row, "engagement")),
    }))
    .filter(
      (r) =>
        r.date || r.followers > 0 || r.views > 0 || r.engagement > 0 || r.followerChange > 0,
    );

  return { posts: [], account };
}

export interface MappingResult extends DetectedMapping, AppliedMapping {}

/** Convenience: auto-detect then apply (used when no explicit mapping is given). */
export function mapTable(table: ParsedTable): MappingResult {
  const detected = detectMapping(table);
  const applied = applyMapping(table, detected.kind, detected.mapping);
  return { ...detected, ...applied };
}

export { POST_FIELDS, ACCOUNT_FIELDS };
