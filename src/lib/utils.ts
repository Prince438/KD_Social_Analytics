import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact number formatting, e.g. 12_300 -> "12.3K". */
export function formatCompact(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}
