import Link from "next/link";
import { StatCard } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import { TrendChart } from "@/components/trend-chart";
import { DashboardControls } from "@/components/dashboard-controls";
import {
  getOverview,
  getTopPosts,
  getTrend,
  type SortMetric,
} from "@/lib/queries";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { PLATFORM_META } from "@/lib/platforms";
import { formatCompact, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID_METRICS = ["views", "likes", "comments", "shares", "engagement_rate"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; metric?: string }>;
}) {
  const sp = await searchParams;
  const range = Number(sp.range) || 30;
  const metric = (VALID_METRICS.includes(sp.metric ?? "")
    ? sp.metric
    : "views") as SortMetric;

  const workspaceId = await getActiveWorkspaceId().catch(() => null);

  const [overview, topPosts, trend] = workspaceId
    ? await Promise.all([
        getOverview(workspaceId, range).catch(() => []),
        getTopPosts({ sinceDays: range, metric, workspaceId, limit: 15 }).catch(
          () => [],
        ),
        getTrend(range, workspaceId).catch(() => []),
      ])
    : [[], [], []];

  const totals = overview.reduce(
    (acc, o) => ({
      followers: acc.followers + o.followers,
      views: acc.views + o.views,
      engagement: acc.engagement + o.engagement,
      posts: acc.posts + o.posts,
      followerChange: acc.followerChange + o.followerChange,
    }),
    { followers: 0, views: 0, engagement: 0, posts: 0, followerChange: 0 },
  );

  const hasData = overview.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-neutral-500">
            Last {range} days across all connected platforms
          </p>
        </div>
      </header>

      {!hasData ? (
        <Card className="text-center">
          <p className="text-neutral-500">No connected accounts yet.</p>
          <Link
            href="/connections"
            className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Connect an account
          </Link>
        </Card>
      ) : (
        <>
          <DashboardControls range={range} metric={metric} />

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Followers" value={formatCompact(totals.followers)} />
            <StatCard
              label="New follows"
              value={`${totals.followerChange >= 0 ? "+" : ""}${formatCompact(
                totals.followerChange,
              )}`}
              sub={`last ${range} days`}
            />
            <StatCard label="Views" value={formatCompact(totals.views)} />
            <StatCard label="Engagement" value={formatCompact(totals.engagement)} />
            <StatCard label="Posts" value={formatCompact(totals.posts)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-4 text-sm font-medium text-neutral-500">
                Trend
              </h2>
              <TrendChart data={trend} />
            </Card>
            <Card>
              <h2 className="mb-4 text-sm font-medium text-neutral-500">
                By platform
              </h2>
              <ul className="space-y-3">
                {overview.map((o) => (
                  <li key={o.platform} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PLATFORM_META[o.platform].color }}
                      />
                      {PLATFORM_META[o.platform].label}
                    </span>
                    <span className="text-right text-neutral-500">
                      {formatCompact(o.views)} views
                      <span className="ml-2 text-neutral-400">
                        {formatCompact(o.engagement)} eng.
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold">Top posts</h2>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-black/10 text-left text-neutral-500 dark:border-white/10">
                  <tr>
                    <th className="p-3 font-medium">Post</th>
                    <th className="p-3 font-medium">Platform</th>
                    <th className="p-3 text-right font-medium">Views</th>
                    <th className="p-3 text-right font-medium">Likes</th>
                    <th className="p-3 text-right font-medium">Comments</th>
                    <th className="p-3 text-right font-medium">Eng. rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-neutral-400">
                        No posts in this window yet.
                      </td>
                    </tr>
                  ) : (
                    topPosts.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-black/5 last:border-0 dark:border-white/5"
                      >
                        <td className="max-w-xs truncate p-3">
                          <a
                            href={p.url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {p.caption ?? "(untitled)"}
                          </a>
                        </td>
                        <td className="p-3">{PLATFORM_META[p.platform].label}</td>
                        <td className="p-3 text-right">{formatCompact(p.views)}</td>
                        <td className="p-3 text-right">{formatCompact(p.likes)}</td>
                        <td className="p-3 text-right">
                          {formatCompact(p.comments)}
                        </td>
                        <td className="p-3 text-right">
                          {formatPercent(p.engagementRate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
