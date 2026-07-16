INSERT INTO "Setting" ("id", "key", "value", "updatedAt") VALUES
  ('c6c0a001-0a01-4d00-9000-000000000001', 'site_brand_display', 'logo', CURRENT_TIMESTAMP),
  ('c6c0a001-0a01-4d00-9000-000000000002', 'runtime_openwa_runtime', 'embedded', CURRENT_TIMESTAMP),
  ('c6c0a001-0a01-4d00-9000-000000000003', 'runtime_openwa_use_chrome', 'true', CURRENT_TIMESTAMP),
  ('c6c0a001-0a01-4d00-9000-000000000004', 'runtime_openwa_session_data_path', 'data/openwa', CURRENT_TIMESTAMP),
  ('c6c0a001-0a01-4d00-9000-000000000005', 'runtime_openwa_qr_timeout', '0', CURRENT_TIMESTAMP),
  ('c6c0a001-0a01-4d00-9000-000000000006', 'runtime_openwa_auth_timeout', '0', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

DELETE FROM "Setting" WHERE "key" IN (
  'runtime_openwa_base_url',
  'runtime_openwa_admin_token',
  'runtime_openwa_webhook_url',
  'runtime_openwa_webhook_secret'
);
