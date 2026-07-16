-- Personal account identity
ALTER TABLE "User" ADD COLUMN "username" TEXT;
UPDATE "User"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || substring("id", 1, 6);
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Resolve the existing owner once so legacy rows can be assigned safely.
ALTER TABLE "FacebookPage" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "userId" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;

UPDATE "FacebookPage" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);
UPDATE "WhatsAppAccount" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);
UPDATE "Contact" SET "userId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);
UPDATE "AutomationRule" SET "userId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);
UPDATE "Broadcast" SET "userId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);
UPDATE "Notification" SET "userId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" LIMIT 1);

ALTER TABLE "FacebookPage" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "WhatsAppAccount" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "AutomationRule" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Broadcast" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "WhatsAppConversation" DROP CONSTRAINT "WhatsAppConversation_contactPhone_fkey";
DROP INDEX "Contact_phone_key";
DROP INDEX "FacebookPage_pageId_key";

CREATE TABLE "UserSetting" (
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId", "key")
);

CREATE INDEX "AutomationRule_userId_channel_idx" ON "AutomationRule"("userId", "channel");
CREATE INDEX "Broadcast_userId_status_idx" ON "Broadcast"("userId", "status");
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
CREATE UNIQUE INDEX "Contact_userId_phone_key" ON "Contact"("userId", "phone");
CREATE INDEX "FacebookPage_ownerId_idx" ON "FacebookPage"("ownerId");
CREATE UNIQUE INDEX "FacebookPage_ownerId_pageId_key" ON "FacebookPage"("ownerId", "pageId");
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "WhatsAppAccount_ownerId_idx" ON "WhatsAppAccount"("ownerId");

ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
