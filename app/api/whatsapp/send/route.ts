import { saveWhatsAppMessage } from "@/lib/openwa";
import { sendOpenWaText } from "@/lib/openwa-runtime";
import { prisma } from "@/lib/prisma";
import { jsonError, parseJson, requireUser, sameOrigin } from "@/lib/api";
import { z } from "zod";
import { INTERNATIONAL_PHONE_PATTERN } from "@/lib/phone";

const phone = z.string().regex(INTERNATIONAL_PHONE_PATTERN);
const schema = z.object({ accountId: z.string().uuid(), phones: z.array(phone).min(1).max(100), message: z.string().trim().min(1).max(4096) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid origin", 403);
  const guard = await requireUser();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) return jsonError("Use international format with country code, for example +201234567890", 422, parsed.error.flatten());
  const phones = [...new Set(parsed.data.phones)];
  if (phones.length > 3) return Response.json({ error: "For more than 3 recipients, create a Broadcast campaign.", code: "broadcast_required", recipients: phones }, { status: 422 });
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: parsed.data.accountId, ownerId: guard.user.id, status: "connected" }, select: { id: true } });
  if (!account) return jsonError("Connected account not found", 404);
  const results = await Promise.all(phones.map(async recipient => {
    try {
      const result = await sendOpenWaText(account.id, recipient, parsed.data.message);
      await saveWhatsAppMessage({ accountId: account.id, contactPhone: recipient, externalId: result.messageId, fromMe: true, content: parsed.data.message, status: "sent", sentAt: new Date(result.timestamp * 1000) });
      return { recipient, ok: true, messageId: result.messageId };
    } catch (error) { return { recipient, ok: false, error: error instanceof Error ? error.message : "Send failed" }; }
  }));
  return Response.json({ results, sent: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length }, { status: results.some(item => !item.ok) ? 207 : 200 });
}
