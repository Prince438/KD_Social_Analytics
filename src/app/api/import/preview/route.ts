import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseFile } from "@/lib/import/parse";
import { detectMapping } from "@/lib/import/mapping";

export const maxDuration = 60;

/**
 * Parses an uploaded file and returns its headers, a few sample rows, and the
 * auto-detected mapping — without importing anything. Powers the review step
 * where the user can correct the column mapping before confirming.
 */
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }

  try {
    const table = await parseFile(file.name, await file.arrayBuffer());
    if (table.headers.length === 0 || table.rows.length === 0) {
      return NextResponse.json(
        { error: "Could not read any rows from the file." },
        { status: 400 },
      );
    }
    const detected = detectMapping(table);
    return NextResponse.json({
      ok: true,
      headers: table.headers,
      sampleRows: table.rows.slice(0, 3),
      rowCount: table.rows.length,
      kind: detected.kind,
      mapping: detected.mapping,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
