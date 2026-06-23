"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const METRICS = [
  { label: "Views", value: "views" },
  { label: "Likes", value: "likes" },
  { label: "Comments", value: "comments" },
  { label: "Engagement", value: "engagement_rate" },
];

/** URL-driven controls for date range, sort metric, and export. */
export function DashboardControls({
  range,
  metric,
}: {
  range: number;
  metric: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setParam("range", String(r.days))}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              range === r.days
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <select
        value={metric}
        onChange={(e) => setParam("metric", e.target.value)}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/10"
      >
        {METRICS.map((m) => (
          <option key={m.value} value={m.value}>
            Sort: {m.label}
          </option>
        ))}
      </select>

      <div className="ml-auto flex gap-2">
        <a
          href={`/api/export?format=csv&range=${range}&metric=${metric}`}
          className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <Download className="h-4 w-4" /> CSV
        </a>
        <a
          href={`/api/export?format=xlsx&range=${range}&metric=${metric}`}
          className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <Download className="h-4 w-4" /> Excel
        </a>
        <a
          href={`/api/export?format=pdf&range=${range}&metric=${metric}`}
          className="inline-flex items-center gap-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <Download className="h-4 w-4" /> PDF
        </a>
      </div>
    </div>
  );
}
