import { env } from "../env";

/**
 * Shared Meta Graph API plumbing for the Facebook and Instagram adapters.
 *
 * Both use the same Facebook Login OAuth and the same `/me/accounts` discovery
 * call; they differ only in which entity (Page vs. connected IG account) they
 * turn into a linked account.
 */
export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions required to read Page + Instagram insights. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];

export function metaConfigured(): boolean {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET);
}

export function metaRedirectUri(platform: "facebook" | "instagram"): string {
  return `${env.APP_URL}/api/connect/${platform}/callback`;
}

export function metaAuthUrl(
  platform: "facebook" | "instagram",
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID!,
    redirect_uri: metaRedirectUri(platform),
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

/** GET a Graph endpoint with an access token, throwing on API errors. */
export async function graphGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Graph ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Exchanges an OAuth `code` for a long-lived (~60 day) user access token.
 * Page tokens derived from a long-lived user token do not themselves expire.
 */
export async function exchangeForLongLivedToken(
  platform: "facebook" | "instagram",
  code: string,
): Promise<{ token: string; expiresAt?: Date }> {
  // 1) code -> short-lived user token
  const short = await graphGet<{ access_token: string }>(
    "oauth/access_token",
    "",
    {
      client_id: env.META_APP_ID!,
      client_secret: env.META_APP_SECRET!,
      redirect_uri: metaRedirectUri(platform),
      code,
    },
  );

  // 2) short-lived -> long-lived user token
  const long = await graphGet<{ access_token: string; expires_in?: number }>(
    "oauth/access_token",
    "",
    {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID!,
      client_secret: env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    },
  );

  return {
    token: long.access_token,
    expiresAt: long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : undefined,
  };
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  followersCount?: number;
  instagram?: {
    id: string;
    username: string;
    profilePictureUrl?: string;
  };
}

/** Lists the Pages the user manages, with each Page's token + connected IG account. */
export async function getManagedPages(userToken: string): Promise<MetaPage[]> {
  const data = await graphGet<{
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      followers_count?: number;
      instagram_business_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
    }>;
  }>("me/accounts", userToken, {
    fields:
      "id,name,access_token,followers_count,instagram_business_account{id,username,profile_picture_url}",
  });

  return (data.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    followersCount: p.followers_count,
    instagram: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          username: p.instagram_business_account.username ?? p.name,
          profilePictureUrl: p.instagram_business_account.profile_picture_url,
        }
      : undefined,
  }));
}
