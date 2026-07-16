import type { Role } from "@/generated/prisma/client";

export const ROLE_WEIGHT: Record<Role, number> = { owner: 4, admin: 3, moderator: 2, user: 1 };
export function canAssignRole(actor: Role, target: Role) { return actor === "owner" && target !== "owner"; }
export function canChangeStatus(actor: Role, target: Role) { return actor === "owner" ? target !== "owner" : actor === "admin" && target === "user"; }
export function canAccessRoute(role: Role, route: string) {
  if (route.startsWith("/owner") || route.startsWith("/api/owner")) return role === "owner";
  if (route === "/admin") return role !== "user";
  if (route === "/api/admin/dashboard") return role === "owner" || role === "admin";
  if (route.startsWith("/admin/users") || route.startsWith("/api/admin/users")) return role === "owner" || role === "admin";
  if (route.startsWith("/admin/reports")) return role !== "user";
  return true;
}
