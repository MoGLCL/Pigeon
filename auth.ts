import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators/auth.schema";

declare module "next-auth" { interface User { username: string; role: string; status: string; forcePasswordReset: boolean; sessionToken: string } interface Session { user: { id: string; name?: string | null; username: string; email?: string | null; image?: string | null; role: string; status: string; forcePasswordReset: boolean; sessionToken: string } } }

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [Credentials({ credentials: { email: {}, password: {} }, async authorize(raw, request) {
    const parsed = loginSchema.safeParse(raw); if (!parsed.success) return null;
    const user = await prisma.user.findFirst({ where: { OR: [{ email: parsed.data.email }, { username: parsed.data.email }] } });
    if (!user || user.status !== "active" || !(await compare(parsed.data.password, user.passwordHash))) return null;
    const sessionToken = randomBytes(32).toString("hex");
    const ipAddress=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")||undefined;
    const userAgent=request.headers.get("user-agent")||undefined;
    await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }), prisma.userSession.create({ data: { userId: user.id, token: sessionToken, ipAddress, userAgent, expiresAt: new Date(Date.now() + 7 * 86400000) } })]);
    return { id: user.id, email: user.email, name: user.name, username: user.username, image: user.avatarUrl, role: user.role, status: user.status, forcePasswordReset: user.forcePasswordReset, sessionToken };
  } })],
  callbacks: {
    async jwt({ token, user }) { if (user) { token.id = user.id; token.sessionToken = user.sessionToken; } return token; },
    async session({ session, token }) {
      if (!token.id || !token.sessionToken) return session;
      const active = await prisma.userSession.findUnique({ where: { token: String(token.sessionToken) }, include: { user: true } });
      if (!active || active.expiresAt < new Date()) return session;
      session.user.id = active.user.id; session.user.name = active.user.name; session.user.email = active.user.email; session.user.username = active.user.username; session.user.role = active.user.role; session.user.status = active.user.status; session.user.forcePasswordReset = active.user.forcePasswordReset; session.user.sessionToken = active.token;
      return session;
    },
  },
});
