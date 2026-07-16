DELETE FROM "WhatsAppMessage"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "conversationId", "externalId"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS duplicate_number
    FROM "WhatsAppMessage"
    WHERE "externalId" IS NOT NULL
  ) duplicates
  WHERE duplicate_number > 1
);

CREATE UNIQUE INDEX "WhatsAppMessage_conversationId_externalId_key"
ON "WhatsAppMessage"("conversationId", "externalId");
