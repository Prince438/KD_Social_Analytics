import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold tracking-tight">KD Social Analytics</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Sign in to view your cross-platform analytics.
        </p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>

        {process.env.NODE_ENV !== "production" && (
          <form
            className="mt-3"
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Dev sign-in (local only)
            </Button>
          </form>
        )}

        <p className="mt-4 text-xs text-neutral-400">
          Access is restricted to allowlisted accounts.
        </p>
      </div>
    </main>
  );
}
