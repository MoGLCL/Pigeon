ALTER TABLE "Report"
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'normal';

UPDATE "Report" AS report
SET
  "contactName" = COALESCE(NULLIF("User"."name", ''), "User"."username"),
  "contactEmail" = "User"."email"
FROM "User"
WHERE report."userId" = "User"."id";

ALTER TABLE "Report"
  ALTER COLUMN "contactName" SET NOT NULL,
  ALTER COLUMN "contactEmail" SET NOT NULL;

DELETE FROM "Setting" WHERE "key" = 'site_primary_color';
