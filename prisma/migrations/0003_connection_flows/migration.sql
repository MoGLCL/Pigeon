ALTER TABLE "FacebookPage"
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "grantedPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'connected',
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "WhatsAppAccount"
  ADD COLUMN "providerSessionId" TEXT,
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "lastConnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "WhatsAppAccount_providerSessionId_key"
  ON "WhatsAppAccount"("providerSessionId");
