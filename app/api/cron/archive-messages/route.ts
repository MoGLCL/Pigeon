import { archiveMessages } from "@/lib/archive";
import { jsonError } from "@/lib/api";
import { validCronRequest } from "@/lib/cron-auth";
export async function POST(request: Request) { if (!await validCronRequest(request)) return jsonError("Unauthorized", 401); return Response.json({ archives: await archiveMessages(new Date(Date.now() - 86400000)) }); }
