import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/client";

export function jsonError(message: string, status = 400, details?: unknown) { return NextResponse.json({ error: message, details }, { status }); }
export async function requireUser(roles?: Role[]) {
  const session = await auth(); const user = session?.user;
  if (!user?.id) return { error: jsonError("Authentication required", 401) } as const;
  if (user.status !== "active") return { error: jsonError("Account is not active", 403) } as const;
  if (roles && !roles.includes(user.role as Role)) return { error: jsonError("Insufficient permissions", 403) } as const;
  return { user } as const;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"); if (!origin) return process.env.NODE_ENV !== "production";
  const expected = process.env.AUTH_URL ?? new URL(request.url).origin;
  return origin === new URL(expected).origin;
}
export async function parseJson(request: Request) { try { return await request.json(); } catch { return null; } }
