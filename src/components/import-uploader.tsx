"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, FileSpreadsheet, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  fieldsForKind,
  FIELD_LABELS,
  type ImportKind,
} from "@/lib/import/fields";

interface Preview {
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  kind: ImportKind;
  mapping: Record<string, string>;
}

interface ImportResult {
  kind: ImportKind;
  rowsImported: number;
  mapping: Record<string, string>;
  unmappedColumns: string[];
}

type Stage = "select" | "review" | "done";

export function ImportUploader({
  platforms,
}: {
  platforms: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("select");
  const [platform, setPlatform] = useState(platforms[0]?.value ?? "");
  const [accountName, setAccountName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [kind, setKind] = useState<ImportKind>("posts");
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function doPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !accountName) return;
    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read file");
      setPreview(data);
      setKind(data.kind);
      setMapping({ ...data.mapping });
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const cleaned = Object.fromEntries(
      Object.entries(mapping).filter(([, v]) => v),
    );
    const fd = new FormData();
    fd.set("file", file);
    fd.set("platform", platform);
    fd.set("accountName", accountName);
    fd.set("kind", kind);
    fd.set("mapping", JSON.stringify(cleaned));

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setStage("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStage("select");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  // ---- Stage: done ----
  if (stage === "done" && result) {
    return (
      <Card>
        <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          Imported {result.rowsImported}{" "}
          {result.kind === "posts" ? "posts" : "daily follower rows"}.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          {Object.entries(result.mapping)
            .map(([f, c]) => `${c} → ${FIELD_LABELS[f] ?? f}`)
            .join(", ")}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => router.push("/")}>View dashboard</Button>
          <Button variant="outline" onClick={reset}>
            Import another
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Stage: review mapping ----
  if (stage === "review" && preview) {
    const fields = fieldsForKind(kind);
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Review column mapping</h2>
          <span className="text-sm text-neutral-500">{preview.rowCount} rows</span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          We auto-matched your columns — adjust anything below before importing.
        </p>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Import as:</span>
          <div className="inline-flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
            {(["posts", "account"] as ImportKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1 ${
                  kind === k
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500"
                }`}
              >
                {k === "posts" ? "Posts" : "Follower trend"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <label key={field} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">
                {FIELD_LABELS[field] ?? field}
              </span>
              <select
                value={mapping[field] ?? ""}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, [field]: e.target.value }))
                }
                className="w-44 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
              >
                <option value="">— skip —</option>
                {preview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {/* Sample preview */}
        <div className="mt-5 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-black/[0.03] text-left text-neutral-500 dark:bg-white/[0.03]">
              <tr>
                {preview.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap p-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, i) => (
                <tr key={i} className="border-t border-black/5 dark:border-white/5">
                  {preview.headers.map((h) => (
                    <td key={h} className="max-w-[160px] truncate p-2">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => setStage("select")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={doImport} disabled={loading}>
            <Upload className="h-4 w-4" />
            {loading ? "Importing…" : "Import analytics"}
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Stage: select file ----
  return (
    <Card>
      <form onSubmit={doPreview} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            >
              {platforms.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Account name</span>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. @mybrand"
              className="mt-1 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </label>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 p-8 text-center text-sm text-neutral-500 transition-colors hover:border-black/40 dark:border-white/20 dark:hover:border-white/40">
          <FileSpreadsheet className="h-6 w-6" />
          {file ? (
            <span className="font-medium text-neutral-900 dark:text-white">{file.name}</span>
          ) : (
            <span>Click to choose a CSV or Excel export (.csv, .xlsx)</span>
          )}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading || !file || !accountName}>
          {loading ? "Reading…" : "Continue"} <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
