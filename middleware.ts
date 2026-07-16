import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/register", "/forgot-password", "/recover-password", "/support", "/terms", "/privacy", "/faq", "/suspended", "/banned", "/unauthorized", "/api/auth", "/api/public/support", "/api/webhooks", "/api/cron", "/api/analytics/visit"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.some(prefix => path.startsWith(prefix))) return NextResponse.next();
  const hasSession = request.cookies.has("authjs.session-token") || request.cookies.has("__Secure-authjs.session-token");
  if (!hasSession) return NextResponse.redirect(new URL("/login", request.url));
  // Role and account status are intentionally not trusted from the JWT. Server pages
  // and every sensitive API call use requireUser(), which rehydrates from PostgreSQL.
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
