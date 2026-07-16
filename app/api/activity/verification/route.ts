import { requireUser, sameOrigin } from "@/lib/api";
import { activityVerificationCookie } from "@/lib/activity-verification";

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": activityVerificationCookie("", request, 0) } },
  );
}
