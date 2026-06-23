import { ImportUploader } from "@/components/import-uploader";
import { PLATFORM_META } from "@/lib/platforms";
import type { Platform } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const platforms = (Object.keys(PLATFORM_META) as Platform[]).map((p) => ({
    value: p,
    label: PLATFORM_META[p].label,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import analytics</h1>
        <p className="text-sm text-neutral-500">
          Upload an analytics export from any platform — no API connection needed. Works
          for platforms you haven&apos;t linked, or to backfill history.
        </p>
      </header>

      <ImportUploader platforms={platforms} />

      <div className="rounded-xl border border-black/10 p-5 text-sm text-neutral-500 dark:border-white/10">
        <h2 className="mb-2 font-medium text-neutral-900 dark:text-white">
          How it works
        </h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            Export your analytics from the platform (YouTube Studio, Meta Business Suite,
            TikTok, etc.) as CSV or Excel.
          </li>
          <li>
            Columns are matched automatically (views, likes, comments, shares, reach,
            title, date…), then you <strong>review and adjust the mapping</strong> before
            importing.
          </li>
          <li>
            Per-post exports populate the posts table &amp; charts; follower time-series
            exports populate the growth trend.
          </li>
          <li>
            Re-uploading updates existing rows, and uploads attach to the active
            workspace shown in the sidebar.
          </li>
        </ul>
      </div>
    </div>
  );
}
