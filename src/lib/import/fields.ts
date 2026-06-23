/**
 * Normalized import field definitions, shared between the server mapping logic
 * and the client mapping editor. Kept free of heavy imports (papaparse/exceljs)
 * so it's safe to use in client components.
 */

export const POST_FIELDS = [
  "postId",
  "caption",
  "url",
  "publishedAt",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "reach",
  "impressions",
] as const;
export type PostField = (typeof POST_FIELDS)[number];

export const ACCOUNT_FIELDS = [
  "date",
  "followers",
  "followerChange",
  "views",
  "engagement",
] as const;
export type AccountField = (typeof ACCOUNT_FIELDS)[number];

export type ImportKind = "posts" | "account";

export const FIELD_LABELS: Record<string, string> = {
  postId: "Post ID",
  caption: "Caption / title",
  url: "URL",
  publishedAt: "Publish date",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  reach: "Reach",
  impressions: "Impressions",
  date: "Date",
  followers: "Followers (total)",
  followerChange: "New followers",
  engagement: "Engagements",
};

/** Fields shown in the mapping editor for a given import kind. */
export function fieldsForKind(kind: ImportKind): readonly string[] {
  return kind === "posts" ? POST_FIELDS : ACCOUNT_FIELDS;
}
