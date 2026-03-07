-- Migration: 0002_research_tracking
-- Adds all research-grade tracking tables and columns

-- ─── USER PROFILE ───────────────────────────────────────────

CREATE TYPE "BiologicalSex" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE "OccupationType" AS ENUM ('sedentary_desk', 'light_activity', 'moderate_activity', 'heavy_activity', 'prefer_not_to_say');
CREATE TYPE "ActivityLevel" AS ENUM ('sedentary', 'lightly_active', 'moderately_active', 'active', 'very_active');

CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "age_group" TEXT,
    "biological_sex" "BiologicalSex",
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "occupation_type" "OccupationType",
    "self_reported_activity_level" "ActivityLevel",
    "referral_source" TEXT,
    "locale" TEXT,
    "consent_given_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "study_group" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── DEVICE ENHANCEMENTS ────────────────────────────────────

ALTER TABLE "devices"
    ADD COLUMN "os_version" TEXT,
    ADD COLUMN "device_model" TEXT,
    ADD COLUMN "notification_permission_granted" BOOLEAN,
    ADD COLUMN "location_permission_level" TEXT,
    ADD COLUMN "activity_permission_granted" BOOLEAN,
    ADD COLUMN "battery_saver_detected" BOOLEAN,
    ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- ─── NUDGE PLAN ENHANCEMENTS ────────────────────────────────

ALTER TABLE "nudge_plans"
    ADD COLUMN "gap_score" DOUBLE PRECISION,
    ADD COLUMN "notification_variant" TEXT,
    ADD COLUMN "manually_triggered_by" UUID,
    ADD COLUMN "manual_nudge_note" TEXT;

-- ─── WALK SESSION ENHANCEMENTS ──────────────────────────────

ALTER TABLE "walk_sessions"
    ADD COLUMN "pause_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "max_speed_mps" DOUBLE PRECISION,
    ADD COLUMN "avg_speed_mps" DOUBLE PRECISION,
    ADD COLUMN "elevation_gain_meters" DOUBLE PRECISION,
    ADD COLUMN "step_source" TEXT,
    ADD COLUMN "motion_confidence" TEXT,
    ADD COLUMN "sensor_health_at_start" TEXT,
    ADD COLUMN "was_recovered" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "nudge_to_start_latency_seconds" INTEGER;

-- ─── WALK PAUSE EVENTS ──────────────────────────────────────

CREATE TABLE "walk_pause_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "pause_started_at" TIMESTAMP(3) NOT NULL,
    "pause_ended_at" TIMESTAMP(3),
    "pause_duration_seconds" INTEGER,
    "pause_source" TEXT,
    "pause_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "walk_pause_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "walk_pause_events_session_id_idx" ON "walk_pause_events"("session_id");
CREATE INDEX "walk_pause_events_user_id_idx" ON "walk_pause_events"("user_id");

ALTER TABLE "walk_pause_events" ADD CONSTRAINT "walk_pause_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "walk_pause_events" ADD CONSTRAINT "walk_pause_events_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "walk_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── WALK ROUTE POINTS ──────────────────────────────────────

CREATE TABLE "walk_route_points" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "altitude_meters" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "bearing_degrees" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "walk_route_points_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "walk_route_points_session_id_idx" ON "walk_route_points"("session_id");
CREATE INDEX "walk_route_points_user_id_idx" ON "walk_route_points"("user_id");

ALTER TABLE "walk_route_points" ADD CONSTRAINT "walk_route_points_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "walk_route_points" ADD CONSTRAINT "walk_route_points_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "walk_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CRASH REPORT ENHANCEMENTS ──────────────────────────────

ALTER TABLE "crash_reports"
    ADD COLUMN "was_walk_in_progress" BOOLEAN,
    ADD COLUMN "recovered_session_id" TEXT,
    ADD COLUMN "app_state" TEXT;

-- ─── BEHAVIOR LOG ENUM ADDITIONS ────────────────────────────
-- Note: PostgreSQL requires separate ALTER TYPE statements for each ADD VALUE

ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'nudge_scheduled';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'nudge_tapped';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'nudge_swiped_away';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'nudge_action_start';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'nudge_action_skip';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'alt_gap_suggested';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'alt_gap_accepted';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'alt_gap_declined';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'manual_nudge_triggered';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'app_foreground_from_nudge';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'settings_changed';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'schedule_source_changed';
ALTER TYPE "BehaviorEventType" ADD VALUE IF NOT EXISTS 'goal_changed';

-- ─── APP SESSIONS ────────────────────────────────────────────

CREATE TYPE "AppOpenSource" AS ENUM ('cold_start', 'notification', 'icon_tap', 'background_restore');

CREATE TABLE "app_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_start" TIMESTAMP(3) NOT NULL,
    "session_end" TIMESTAMP(3),
    "foreground_seconds" INTEGER,
    "screens_visited" JSONB,
    "source" "AppOpenSource" NOT NULL DEFAULT 'cold_start',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_sessions_user_id_idx" ON "app_sessions"("user_id");
CREATE INDEX "app_sessions_session_start_idx" ON "app_sessions"("session_start");

ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── USER ACHIEVEMENTS ───────────────────────────────────────

CREATE TABLE "user_achievements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_achievements_user_id_achievement_id_key" ON "user_achievements"("user_id", "achievement_id");
CREATE INDEX "user_achievements_user_id_idx" ON "user_achievements"("user_id");

ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── GAP OPPORTUNITIES ───────────────────────────────────────

CREATE TABLE "gap_opportunities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "gap_start" TIMESTAMP(3) NOT NULL,
    "gap_end" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "available_walk_minutes" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "was_used_for_nudge" BOOLEAN NOT NULL DEFAULT false,
    "reason_not_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gap_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gap_opportunities_user_id_date_idx" ON "gap_opportunities"("user_id", "date");

-- ─── RESEARCHER ACTIONS ──────────────────────────────────────

CREATE TYPE "ResearcherActionType" AS ENUM (
    'manual_nudge', 'export_data', 'view_profile', 'modify_study',
    'enroll_participant', 'withdraw_participant', 'send_message'
);

CREATE TABLE "researcher_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "researcher_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action_type" "ResearcherActionType" NOT NULL,
    "payload" JSONB,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "researcher_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "researcher_actions_researcher_id_idx" ON "researcher_actions"("researcher_id");
CREATE INDEX "researcher_actions_target_user_id_idx" ON "researcher_actions"("target_user_id");
CREATE INDEX "researcher_actions_performed_at_idx" ON "researcher_actions"("performed_at");

ALTER TABLE "researcher_actions" ADD CONSTRAINT "researcher_actions_researcher_id_fkey"
    FOREIGN KEY ("researcher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "researcher_actions" ADD CONSTRAINT "researcher_actions_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
