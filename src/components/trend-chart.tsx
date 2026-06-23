"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/queries";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400">
        No trend data yet — connect an account, run a sync, or import an export.
      </div>
    );
  }

  // Prefer the follower line; if no follower totals exist (e.g. an X account
  // export that only has daily impressions), show the views/impressions line.
  const hasFollowers = data.some((d) => d.followers > 0);
  const metric = hasFollowers ? "followers" : "views";
  const label = hasFollowers ? "Followers" : "Views / impressions";

  return (
    <div className="h-64 w-full">
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="followers" x1="0" y1="0" x2="0" y2="1">
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
            fill="url(#followers)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
