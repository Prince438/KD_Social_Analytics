import { desc, eq } from "drizzle-orm";
import { Plus, CheckCircle2, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { linkedAccounts, type Platform } from "@/lib/db/schema";
import { PLATFORM_META, getAdapter } from "@/lib/platforms";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { deleteLinkedAccount } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const workspaceId = await getActiveWorkspaceId().catch(() => null);
  const accounts = workspaceId
    ? await db
        .select()
        .from(linkedAccounts)
        .where(eq(linkedAccounts.workspaceId, workspaceId))
        .orderBy(desc(linkedAccounts.createdAt))
        .catch(() => [])
    : [];

  const platforms = Object.keys(PLATFORM_META) as Platform[];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <p className="text-sm text-neutral-500">
            Link social accounts to pull their analytics.
          </p>
        </div>
        <SyncButton />
      </header>

      {accounts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-500">
            Linked accounts
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <Card key={a.id} className="flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: PLATFORM_META[a.platform].color }}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.displayName}</div>
                  <div className="text-xs text-neutral-500">
                    {PLATFORM_META[a.platform].label}
                    {a.source === "manual" ? " · manual upload" : ""}
                    {a.lastSyncedAt
                      ? ` · ${a.source === "manual" ? "imported" : "synced"} ${new Date(
                          a.lastSyncedAt,
                        ).toLocaleDateString()}`
                      : " · never synced"}
                  </div>
                </div>
                <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-green-500" />
                <form action={deleteLinkedAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    title="Disconnect"
                    className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          Available platforms
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {platforms.map((p) => {
            const meta = PLATFORM_META[p];
            const adapter = getAdapter(p);
            const configured = adapter?.isConfigured() ?? false;
            const canConnect = meta.status === "live" && configured;

            return (
              <Card key={p} className="flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <div className="min-w-0">
                  <div className="font-medium">{meta.label}</div>
                  <div className="text-xs text-neutral-500">
                    {meta.status === "live"
                      ? configured
                        ? "Ready to connect"
                        : "Add API credentials to enable"
                      : "Coming soon"}
                  </div>
                </div>
                {canConnect ? (
                  <a
                    href={`/api/connect/${p}`}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
                  >
                    <Plus className="h-4 w-4" /> Connect
                  </a>
                ) : (
                  <span className="ml-auto rounded-lg border border-black/10 px-3 py-1.5 text-sm text-neutral-400 dark:border-white/10">
                    {meta.status === "live" ? "Setup needed" : "Soon"}
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
