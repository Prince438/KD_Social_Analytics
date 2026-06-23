"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/queries";

type Metric = "followers" | "views" | "engagement";

const METRICS: { key: Metric; label: string }[] = [
  { key: "followers", label: "Followers" },
  { key: "views", label: "Views" },
  { key: "engagement", label: "Engagement" },
];

export function TrendChart({ data }: { data: TrendPoint[] }) {
  // Default to the first metric that actually has data, so account-level
  // imports (e.g. an X export with impressions but no follower total) open on
  // a populated series instead of a flat zero line.
  const totals: Record<Metric, number> = {
    followers: data.reduce((s, d) => s + d.followers, 0),
    views: data.reduce((s, d) => s + d.views, 0),
    engagement: data.reduce((s, d) => s + d.engagement, 0),
  };
  const defaultMetric =
    (METRICS.find((m) => totals[m.key] > 0)?.key ?? "followers") as Metric;
  const [metric, setMetric] = useState<Metric>(defaultMetric);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400">
        No trend data yet — connect an account, run a sync, or import an export.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-black/10 p-0.5 text-xs dark:border-white/10">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              metric === m.key
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
              stroke="currentColor"
              opacity={0.4}
            />
            <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.1)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#trendFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
