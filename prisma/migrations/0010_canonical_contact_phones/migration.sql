CREATE TABLE "_ContactMergeMigration0010" (
  source_id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL
);

-- Merge legacy LID-shaped contacts into the real phone resolved for that chat.
INSERT INTO "_ContactMergeMigration0010" (source_id, target_id)
SELECT DISTINCT ON (source."id") source."id", target."id"
FROM "Contact" source
JOIN "WhatsAppAccount" account ON account."ownerId" = source."userId"
JOIN "WhatsAppConversation" conversation ON conversation."accountId" = account."id"
JOIN "Contact" target
  ON target."userId" = source."userId"
 AND target."phone" = conversation."contactPhone"
WHERE conversation."contactJid" LIKE '%@lid'
  AND regexp_replace(source."phone", '^\+', '') = regexp_replace(conversation."contactJid", '@.*$', '')
  AND source."id" <> target."id"
ORDER BY source."id", target."createdAt" ASC;

-- Merge the old no-plus form into its canonical international form.
INSERT INTO "_ContactMergeMigration0010" (source_id, target_id)
SELECT source."id", target."id"
FROM "Contact" source
JOIN "Contact" target
  ON target."userId" = source."userId"
 AND target."phone" = '+' || source."phone"
WHERE source."phone" ~ '^[1-9][0-9]{6,14}$'
  AND source."id" <> target."id"
ON CONFLICT (source_id) DO NOTHING;

UPDATE "ContactTag" tag
SET "contactId" = merge.target_id
FROM "_ContactMergeMigration0010" merge
WHERE tag."contactId" = merge.source_id;

UPDATE "BroadcastRecipient" recipient
SET "contactId" = merge.target_id
FROM "_ContactMergeMigration0010" merge
WHERE recipient."contactId" = merge.source_id;

DELETE FROM "Contact" contact
USING "_ContactMergeMigration0010" merge
WHERE contact."id" = merge.source_id;

-- Canonicalize remaining standalone international numbers when no collision exists.
UPDATE "Contact" contact
SET "phone" = '+' || contact."phone"
WHERE contact."phone" ~ '^[1-9][0-9]{6,14}$'
  AND NOT EXISTS (
    SELECT 1 FROM "Contact" canonical
    WHERE canonical."userId" = contact."userId"
      AND canonical."phone" = '+' || contact."phone"
  );

DROP TABLE "_ContactMergeMigration0010";
