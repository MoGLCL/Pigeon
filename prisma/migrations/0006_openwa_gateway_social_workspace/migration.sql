ALTER TABLE "WhatsAppAccount"
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
  ALTER COLUMN "openwaBaseUrl" DROP NOT NULL,
  ALTER COLUMN "openwaAuthEnc" DROP NOT NULL;

DELETE FROM "Setting" WHERE "key" IN (
  'runtime_openwa_runtime',
  'runtime_openwa_use_chrome',
  'runtime_openwa_executable_path',
  'runtime_openwa_session_data_path',
  'runtime_openwa_qr_timeout',
  'runtime_openwa_auth_timeout'
);

INSERT INTO "Setting" ("id", "key", "value", "updatedAt") VALUES
  ('c6c0a001-0a01-4d00-9000-000000000101', 'runtime_openwa_base_url', 'http://openwa:2785/api', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
