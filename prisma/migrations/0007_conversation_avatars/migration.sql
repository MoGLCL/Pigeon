ALTER TABLE "FacebookConversation" ADD COLUMN IF NOT EXISTS "participantAvatarUrl" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "contactAvatarUrl" TEXT;
