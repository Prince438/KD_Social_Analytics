"use client";

import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { createWorkspace, setActiveWorkspace } from "@/lib/actions";

interface Workspace {
  id: string;
  name: string;
}

/** Sidebar control to switch between workspaces or create a new one. */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const switchFormRef = useRef<HTMLFormElement>(null);
  const active = workspaces.find((w) => w.id === activeId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
      >
        <span className="truncate font-medium">{active?.name ?? "Workspace"}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-black/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
          {/* Each workspace submits the switch action. */}
          <form ref={switchFormRef} action={setActiveWorkspace}>
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="submit"
                name="id"
                value={w.id}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="truncate">{w.name}</span>
                {w.id === activeId && <Check className="h-4 w-4 text-green-500" />}
              </button>
            ))}
          </form>

          <div className="my-1 border-t border-black/10 dark:border-white/10" />

          {creating ? (
            <form action={createWorkspace} className="flex gap-1 p-1">
              <input
                name="name"
                autoFocus
                placeholder="Workspace name"
                className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
              />
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-white dark:text-neutral-900"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Plus className="h-4 w-4" /> New workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
