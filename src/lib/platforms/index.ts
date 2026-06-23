import type { Platform } from "../db/schema";
import type { PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtube";
import { facebookAdapter } from "./facebook";
import { instagramAdapter } from "./instagram";
import { threadsAdapter } from "./threads";
import { tiktokAdapter } from "./tiktok";

/**
 * Registry of platform adapters. Add new platforms here as they're built.
 * Phases 1–3 ship YouTube + the Meta family + TikTok; X/LinkedIn slot in next.
 */
export const adapters: Partial<Record<Platform, PlatformAdapter>> = {
  youtube: youtubeAdapter,
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
  tiktok: tiktokAdapter,
};

/** UI metadata for every platform, including ones not yet implemented. */
export const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; status: "live" | "planned" }
> = {
  youtube: { label: "YouTube", color: "#FF0000", status: "live" },
  instagram: { label: "Instagram", color: "#E1306C", status: "live" },
  facebook: { label: "Facebook", color: "#1877F2", status: "live" },
  threads: { label: "Threads", color: "#000000", status: "live" },
  tiktok: { label: "TikTok", color: "#69C9D0", status: "live" },
  x: { label: "X (Twitter)", color: "#000000", status: "planned" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", status: "planned" },
};

export function getAdapter(platform: Platform): PlatformAdapter | undefined {
  return adapters[platform];
}

export function liveAdapters(): PlatformAdapter[] {
  return Object.values(adapters).filter((a): a is PlatformAdapter =>
    Boolean(a?.isConfigured()),
  );
}
