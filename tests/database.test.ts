import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { decrypt, encrypt } from "../lib/encryption";
import { writeAuditLog } from "../lib/audit";
import { saveWhatsAppMessage } from "../lib/openwa";
import { saveFacebookMessage } from "../lib/facebook";

const marker = Date.now();
const testEmail = `integration-${marker}@pigeon.local`;
const testUsername = `integration_${marker}`;
let testUserId = "";
let testWaAccountId = "";
let testFacebookPageId = "";

afterAll(async () => {
  if (testFacebookPageId) {
    const conversations = await prisma.facebookConversation.findMany({ where: { pageId: testFacebookPageId }, select: { id: true } });
    await prisma.facebookMessage.deleteMany({ where: { conversationId: { in: conversations.map(item => item.id) } } });
    await prisma.facebookConversation.deleteMany({ where: { pageId: testFacebookPageId } });
    await prisma.facebookPage.deleteMany({ where: { id: testFacebookPageId } });
  }
  if (testWaAccountId) {
    const conversations = await prisma.whatsAppConversation.findMany({ where: { accountId: testWaAccountId }, select: { id: true } });
    await prisma.whatsAppMessage.deleteMany({ where: { conversationId: { in: conversations.map(item => item.id) } } });
    await prisma.whatsAppConversation.deleteMany({ where: { accountId: testWaAccountId } });
    await prisma.whatsAppAccount.deleteMany({ where: { id: testWaAccountId } });
  }
  if (testUserId) {
    await prisma.notification.deleteMany({ where: { userId: testUserId } });
    await prisma.contactTag.deleteMany({ where: { contact: { userId: testUserId } } });
    await prisma.contact.deleteMany({ where: { userId: testUserId } });
    await prisma.auditLog.deleteMany({ where: { targetId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  }
  await prisma.$disconnect();
}, 30_000);

describe("PostgreSQL integration", () => {
  it("has the seeded owner and core settings", async () => {
    const owner = await prisma.user.findUnique({ where: { email: process.env.OWNER_EMAIL!.toLowerCase() } });
    expect(owner?.role).toBe("owner");
    expect(owner?.status).toBe("active");
    const settings = await prisma.setting.findMany({ where: { key: { in: ["site_name", "archive_time", "archive_keep_live"] } } });
    expect(settings).toHaveLength(3);
  }, 30_000);

  it("uses safe database defaults for new accounts", async () => {
    const user = await prisma.user.create({ data: { username: testUsername, email: testEmail, passwordHash: "integration-only" } });
    testUserId = user.id;
    expect(user.role).toBe("user");
    expect(user.status).toBe("active");
    expect(user.forcePasswordReset).toBe(false);
  }, 30_000);

  it("persists audit details as authenticated ciphertext", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: process.env.OWNER_EMAIL!.toLowerCase() } });
    const details = { before: "user", after: "moderator", marker: `secret-${marker}` };
    const log = await writeAuditLog(owner.id, "integration.role.change", details, testUserId, "127.0.0.1");
    expect(log.detailsEnc).not.toContain(details.marker);
    expect(JSON.parse(decrypt(log.detailsEnc))).toEqual(details);
  }, 30_000);

  it("stores an incoming WhatsApp chat with avatar and creates its notification", async () => {
    const account = await prisma.whatsAppAccount.create({ data: { ownerId: testUserId, sessionName: `integration-${marker}`, status: "connected" } });
    testWaAccountId = account.id;
    await saveWhatsAppMessage({ accountId: account.id, contactPhone: "+201111111111", contactJid: "201111111111@c.us", contactName: "Integration contact", contactAvatarUrl: "https://example.com/avatar.jpg", externalId: `integration-message-${marker}`, fromMe: false, content: "Integration hello", sentAt: new Date() });
    const [conversation, notification] = await Promise.all([
      prisma.whatsAppConversation.findUnique({ where: { accountId_contactPhone: { accountId: account.id, contactPhone: "+201111111111" } } }),
      prisma.notification.findFirst({ where: { userId: testUserId, type: "whatsapp_message" } }),
    ]);
    expect(conversation?.contactName).toBe("Integration contact");
    expect(conversation?.contactAvatarUrl).toBe("https://example.com/avatar.jpg");
    expect(notification?.title).toContain("Integration contact");
    expect(notification?.isRead).toBe(false);
  }, 30_000);

  it("stores an incoming Messenger thread with its real participant avatar and notification", async () => {
    const page = await prisma.facebookPage.create({ data: { ownerId: testUserId, pageId: `integration-page-${marker}`, name: "Integration Page", accessTokenEnc: encrypt("integration-token") } });
    testFacebookPageId = page.id;
    await saveFacebookMessage({ pageId: page.id, conversationExternalId: `participant-${marker}`, messageExternalId: `messenger-message-${marker}`, participantId: `participant-${marker}`, participantName: "Messenger contact", participantAvatarUrl: "https://example.com/messenger-avatar.jpg", content: "Messenger hello", fromPage: false, sentAt: new Date() });
    const [conversation, notification] = await Promise.all([
      prisma.facebookConversation.findUnique({ where: { pageId_externalId: { pageId: page.id, externalId: `participant-${marker}` } } }),
      prisma.notification.findFirst({ where: { userId: testUserId, type: "messenger_message" } }),
    ]);
    expect(conversation?.participantName).toBe("Messenger contact");
    expect(conversation?.participantAvatarUrl).toBe("https://example.com/messenger-avatar.jpg");
    expect(notification?.title).toContain("Messenger contact");
    expect(notification?.isRead).toBe(false);
  }, 30_000);
});
