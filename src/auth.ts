import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { allowedEmails, env } from "@/lib/env";

const isDev = process.env.NODE_ENV !== "production";

/**
 * App login (who can access the dashboard) — separate from the per-platform
 * OAuth used to link social accounts. Uses Google sign-in gated by an email
 * allowlist, with a stateless JWT session (no DB adapter needed for login).
 *
 * In development only, a passwordless "Dev sign-in" provider is added so the
 * dashboard can be used without configuring Google OAuth. It is never
 * registered in production.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
    ...(isDev
      ? [
          Credentials({
            id: "dev",
            name: "Dev sign-in",
            credentials: {},
            authorize: () => ({
              id: "dev-user",
              name: "Dev User",
              email: allowedEmails[0] ?? "dev@example.com",
            }),
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      // If no allowlist is configured, deny by default in production but allow
      // in development for easier local setup.
      if (allowedEmails.length === 0) {
        return process.env.NODE_ENV !== "production";
      }
      return Boolean(email && allowedEmails.includes(email));
    },
  },
});
