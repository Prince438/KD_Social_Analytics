import Link from "next/link";
import { BarChart3, Link2, LayoutDashboard, LogOut, Upload } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { getActiveWorkspaceId, listWorkspaces } from "@/lib/workspace";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const [workspaces, activeWorkspaceId] = await Promise.all([
    listWorkspaces().catch(() => []),
    getActiveWorkspaceId().catch(() => ""),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/10 p-4 dark:border-white/10 md:flex">
        <div className="flex items-center gap-2 px-2 py-3 text-lg font-semibold">
          <BarChart3 className="h-5 w-5" />
          KD Analytics
        </div>
        {workspaces.length > 0 && (
          <div className="mt-2">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={activeWorkspaceId}
            />
          </div>
        )}
        <nav className="mt-4 flex flex-col gap-1 text-sm">
          <NavLink href="/" icon={<LayoutDashboard className="h-4 w-4" />}>
            Dashboard
          </NavLink>
          <NavLink href="/connections" icon={<Link2 className="h-4 w-4" />}>
            Connections
          </NavLink>
          <NavLink href="/import" icon={<Upload className="h-4 w-4" />}>
            Import
          </NavLink>
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-2 pt-4 text-xs text-neutral-500">
          <span className="truncate">{session?.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="ghost" className="px-2 py-1" title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-neutral-700 transition-colors hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
    >
      {icon}
      {children}
    </Link>
  );
}
