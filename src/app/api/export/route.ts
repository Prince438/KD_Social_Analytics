import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { getOverview, getTopPosts, type SortMetric } from "@/lib/queries";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { PLATFORM_META } from "@/lib/platforms";
import { renderReportPdf } from "@/lib/pdf-report";

const VALID_METRICS = ["views", "likes", "comments", "shares", "engagement_rate"];

const COLUMNS = [
  { header: "Platform", key: "platform" },
  { header: "Account", key: "account" },
  { header: "Caption", key: "caption" },
  { header: "Published", key: "published" },
  { header: "Views", key: "views" },
  { header: "Likes", key: "likes" },
  { header: "Comments", key: "comments" },
  { header: "Shares", key: "shares" },
  { header: "Engagement rate", key: "engagement" },
  { header: "URL", key: "url" },
];

/** Exports the current top-posts view as CSV or XLSX. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const formatParam = url.searchParams.get("format");
  const format =
    formatParam === "xlsx" || formatParam === "pdf" ? formatParam : "csv";
  const range = Number(url.searchParams.get("range")) || 30;
  const metricParam = url.searchParams.get("metric") ?? "views";
  const metric = (VALID_METRICS.includes(metricParam) ? metricParam : "views") as SortMetric;

  const workspaceId = await getActiveWorkspaceId();
  const rows = await getTopPosts({ sinceDays: range, metric, workspaceId, limit: 1000 });
  const filename = `analytics-${range}d-${metric}-${new Date().toISOString().slice(0, 10)}`;

  // ---- PDF: a formatted report with KPIs + top posts ----
  if (format === "pdf") {
    const [overview, ws] = await Promise.all([
      getOverview(workspaceId, range),
      db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1),
    ]);
    const totals = overview.reduce(
      (acc, o) => ({
        followers: acc.followers + o.followers,
        views: acc.views + o.views,
        engagement: acc.engagement + o.engagement,
        posts: acc.posts + o.posts,
      }),
      { followers: 0, views: 0, engagement: 0, posts: 0 },
    );
    const pdf = await renderReportPdf({
      workspaceName: ws[0]?.name ?? "Workspace",
      rangeDays: range,
      generatedAt: new Date().toLocaleString(),
      totals,
      topPosts: rows.slice(0, 30),
    });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  const data = rows.map((p) => ({
    platform: PLATFORM_META[p.platform].label,
    account: p.displayName,
    caption: p.caption ?? "",
    published: p.publishedAt ?? "",
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    engagement: (p.engagementRate * 100).toFixed(2) + "%",
    url: p.url ?? "",
  }));

  if (format === "csv") {
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = COLUMNS.map((c) => c.header).join(",");
    const body = data
      .map((row) => COLUMNS.map((c) => escape(row[c.key as keyof typeof row])).join(","))
      .join("\n");
    return new NextResponse(`${header}\n${body}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // XLSX
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Top posts");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  ws.getRow(1).font = { bold: true };
  data.forEach((row) => ws.addRow(row));

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
