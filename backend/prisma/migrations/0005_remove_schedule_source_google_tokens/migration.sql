ALTER TABLE "schedule_sources"
DROP COLUMN IF EXISTS "google_access_token",
DROP COLUMN IF EXISTS "google_refresh_token",
DROP COLUMN IF EXISTS "google_token_expiry";
