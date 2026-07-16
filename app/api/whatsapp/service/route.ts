import { requireUser } from "@/lib/api";
import { checkOpenWaHealth } from "@/lib/openwa-health";

export async function GET() {
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  return Response.json(await checkOpenWaHealth());
}
