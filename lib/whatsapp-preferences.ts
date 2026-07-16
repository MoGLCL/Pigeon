import { prisma } from "@/lib/prisma";

export const AUTO_ADD_WHATSAPP_CONTACTS_KEY = "auto_add_whatsapp_contacts";

export async function autoAddWhatsAppContacts(userId: string) {
  const setting = await prisma.userSetting.findUnique({
    where: { userId_key: { userId, key: AUTO_ADD_WHATSAPP_CONTACTS_KEY } },
    select: { value: true },
  });
  return setting?.value === "true";
}
