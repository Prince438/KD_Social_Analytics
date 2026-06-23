import type { Platform, LinkedAccount } from "../db/schema";

/** OAuth token set returned by exchange/refresh. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry; undefined means non-expiring (e.g. some long-lived tokens). */
  expiresAt?: Date;
}

/** Identity + tokens captured when an account is first linked. */
export interface AccountIdentity {
  platformAccountId: string;
  displayName: string;
  avatarUrl?: string;
  tokens: TokenSet;
  /** Optional platform-specific blob persisted to linked_accounts.metadata. */
  metadata?: Record<string, unknown>;
}

/** A post normalized into our internal shape. */
export interface NormalizedPost {
  platformPostId: string;
  type?: string;
  caption?: string;
  url?: string;
  thumbnailUrl?: string;
  publishedAt?: Date;
}

/** Per-post metrics for a given day, normalized across platforms. */
export interface NormalizedMetric {
  platformPostId: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  impressions?: number;
}

/** Account-level snapshot (followers etc.). */
export interface NormalizedAccountMetric {
  followers?: number;
  views?: number;
  engagement?: number;
}

/**
 * Every platform integration implements this interface. The rest of the app
 * (connect flow, sync job, UI) only ever talks to these methods, never to
 * platform-specific responses.
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  /** Human label for UI. */
  readonly label: string;
  /** Whether the required env credentials are present. */
  isConfigured(): boolean;

  // --- OAuth ---
  /** URL to start the OAuth consent flow. `state` ties the callback back to a workspace. */
  getAuthUrl(state: string): string;
  /**
   * Exchange the callback `code` for tokens + account identity. May return
   * multiple identities when one OAuth grant covers several accounts (e.g. a
   * Meta login that exposes multiple Pages / Instagram accounts).
   */
  exchangeCode(code: string): Promise<AccountIdentity | AccountIdentity[]>;
  /** Refresh an expiring access token. */
  refreshToken(refreshToken: string): Promise<TokenSet>;

  // --- Data ---
  fetchPosts(account: LinkedAccount, accessToken: string): Promise<NormalizedPost[]>;
  fetchPostMetrics(
    account: LinkedAccount,
    accessToken: string,
    platformPostIds: string[],
  ): Promise<NormalizedMetric[]>;
  fetchAccountMetrics(
    account: LinkedAccount,
    accessToken: string,
  ): Promise<NormalizedAccountMetric>;
}

/** Thrown when a platform is used without its env credentials configured. */
export class PlatformNotConfiguredError extends Error {
  constructor(platform: Platform) {
    super(`Platform "${platform}" is not configured. Add its credentials to your environment.`);
    this.name = "PlatformNotConfiguredError";
  }
}
