import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./db";
import { workspaces } from "./db/schema";

const DEFAULT_NAME = "Default";
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

/** Returns the default workspace id, creating it on first use. */
export async function getDefaultWorkspaceId(): Promise<string> {
  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.name, DEFAULT_NAME))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(workspaces)
    .values({ name: DEFAULT_NAME })
    .returning({ id: workspaces.id });
  return created.id;
}

/** All workspaces, oldest first. */
export async function listWorkspaces() {
  return db.select().from(workspaces).orderBy(asc(workspaces.createdAt));
}

/**
 * The currently selected workspace, from the `active_workspace` cookie.
 * Falls back to (and lazily creates) the default workspace. Read-only: the
 * cookie is only written by the workspace switcher action, never during render.
 */
export async function getActiveWorkspaceId(): Promise<string> {
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (cookieId) {
    const found = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, cookieId))
      .limit(1);
    if (found[0]) return found[0].id;
  }
  return getDefaultWorkspaceId();
}
