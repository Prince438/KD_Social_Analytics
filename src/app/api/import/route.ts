import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { importAnalyticsFile } from "@/lib/import/import-service";
import { platformEnum, type Platform } from "@/lib/db/schema";

export const maxDuration = 60;

const VALID_PLATFORMS = platformEnum.enumValues as readonly string[];

/** Imports an uploaded analytics export (CSV/XLSX) as a manual account. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  const platform = String(form.get("platform") ?? "");
  const accountName = String(form.get("accountName") ?? "").trim();
  const kindRaw = String(form.get("kind") ?? "");
  const mappingRaw = String(form.get("mapping") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (!accountName) {
    return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }

  // Optional explicit mapping from the review step.
  let kind: "posts" | "account" | undefined;
  let mapping: Record<string, string> | undefined;
  if (kindRaw === "posts" || kindRaw === "account") {
    kind = kindRaw;
    try {
      const parsed = mappingRaw ? JSON.parse(mappingRaw) : {};
      if (parsed && typeof parsed === "object") {
        mapping = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string" && v)
            .map(([k, v]) => [k, String(v)]),
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid mapping" }, { status: 400 });
    }
  }

  try {
    const workspaceId = await getActiveWorkspaceId();
    const summary = await importAnalyticsFile({
      filename: file.name,
      buffer: await file.arrayBuffer(),
      platform: platform as Platform,
      accountName,
      workspaceId,
      kind,
      mapping,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
