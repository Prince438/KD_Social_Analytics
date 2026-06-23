import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Protects dashboard pages. Unauthenticated users are redirected to /login.
 * API routes enforce their own authorization (session and/or CRON_SECRET), so
 * the proxy lets them through — otherwise the cron call to /api/sync would be
 * redirected to /login.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next");

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything except static files and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
