"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "./db";
import { workspaces, linkedAccounts } from "./db/schema";
import { ACTIVE_WORKSPACE_COOKIE } from "./workspace";

const COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};

async function requireAuth() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
}

/** Creates a workspace and switches to it. */
export async function createWorkspace(formData: FormData) {
  await requireAuth();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const [ws] = await db
    .insert(workspaces)
    .values({ name })
    .returning({ id: workspaces.id });

  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, ws.id, COOKIE_OPTS);
  revalidatePath("/", "layout");
}

/** Switches the active workspace. */
export async function setActiveWorkspace(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, COOKIE_OPTS);
  revalidatePath("/", "layout");
}

/** Disconnects (deletes) a linked account and all its data. */
export async function deleteLinkedAccount(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(linkedAccounts).where(eq(linkedAccounts.id, id));
  revalidatePath("/connections");
  revalidatePath("/");
}
