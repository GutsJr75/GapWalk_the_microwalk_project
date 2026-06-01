-- Migration: 0006_remove_research
-- Removes all research-grade infrastructure to convert the backend into a
-- clean production API:
--   * Drops Study / StudyEnrollment / ResearcherAction models
--   * Drops research framing columns on user_profiles
--   * Collapses the UserRole enum from (participant|researcher|admin) to (user|admin)
--
-- The droplet starts fresh (no data to preserve), but this is written as a
-- forward-compatible migration: any existing 'participant'/'researcher' rows are
-- safely remapped to 'user'.

-- ─── DROP RESEARCH TABLES ───────────────────────────────────
-- researcher_actions and study_enrollments reference users / studies, so drop
-- them before the parent table. IF EXISTS keeps this idempotent.
DROP TABLE IF EXISTS "researcher_actions";
DROP TABLE IF EXISTS "study_enrollments";
DROP TABLE IF EXISTS "studies";

DROP TYPE IF EXISTS "ResearcherActionType";

-- ─── SIMPLIFY USER PROFILE ──────────────────────────────────
-- Repurpose user_profiles as optional personalization only; drop research framing.
ALTER TABLE "user_profiles"
    DROP COLUMN IF EXISTS "consent_given_at",
    DROP COLUMN IF EXISTS "consent_version",
    DROP COLUMN IF EXISTS "onboarding_completed_at",
    DROP COLUMN IF EXISTS "study_group";

-- ─── COLLAPSE UserRole ENUM ─────────────────────────────────
-- Postgres cannot drop values from an enum in place, so recreate the type and
-- remap rows: participant|researcher -> user, admin -> admin.
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
    ALTER COLUMN "role" TYPE "UserRole"
    USING (
        CASE "role"::text
            WHEN 'admin' THEN 'admin'::"UserRole"
            ELSE 'user'::"UserRole"
        END
    );
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

DROP TYPE "UserRole_old";
