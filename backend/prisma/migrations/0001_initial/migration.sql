-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('participant', 'researcher', 'admin');
CREATE TYPE "ScheduleSourceType" AS ENUM ('ics', 'manual', 'google');
CREATE TYPE "WhenToNotify" AS ENUM ('now', 'delay', 'next_gap');
CREATE TYPE "StrictnessMode" AS ENUM ('easygoing', 'no_excuses');
CREATE TYPE "NudgePlanStatus" AS ENUM ('planned', 'notified', 'started', 'completed', 'skipped', 'cancelled');
CREATE TYPE "NudgePlanOrigin" AS ENUM ('server', 'local_fallback');
CREATE TYPE "BehaviorEventType" AS ENUM ('nudge_received', 'nudge_opened', 'nudge_dismissed', 'nudge_expired', 'walk_started', 'walk_completed', 'walk_paused', 'walk_resumed', 'walk_cancelled', 'app_opened', 'app_backgrounded');
CREATE TYPE "PushStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'device_not_registered');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'participant',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "ScheduleSourceType" NOT NULL,
    "filename" TEXT,
    "last_imported_at" TIMESTAMP(3),
    "google_connected" BOOLEAN NOT NULL DEFAULT false,
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "google_token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "busy_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "local_id" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "source" "ScheduleSourceType" NOT NULL,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "busy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_schedule_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "local_id" TEXT,
    "title" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_one_time" BOOLEAN NOT NULL DEFAULT false,
    "one_time_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "daily_target_minutes" INTEGER NOT NULL DEFAULT 15,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 2,
    "notification_count_per_day" INTEGER NOT NULL DEFAULT 2,
    "notification_min_gap_minutes" INTEGER NOT NULL DEFAULT 60,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '23:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '06:00',
    "min_walk_minutes" INTEGER NOT NULL DEFAULT 6,
    "grace_period_minutes" INTEGER NOT NULL DEFAULT 2,
    "when_to_notify" "WhenToNotify" NOT NULL DEFAULT 'delay',
    "notify_delay_minutes" INTEGER NOT NULL DEFAULT 5,
    "strictness_mode" "StrictnessMode" NOT NULL DEFAULT 'easygoing',
    "step_goal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "step_goal" INTEGER NOT NULL DEFAULT 1000,
    "preferred_walking_periods" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nudge_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "local_id" TEXT,
    "date" TEXT NOT NULL,
    "gap_start" TIMESTAMP(3) NOT NULL,
    "gap_end" TIMESTAMP(3) NOT NULL,
    "walk_start" TIMESTAMP(3) NOT NULL,
    "suggested_duration_minutes" INTEGER NOT NULL,
    "status" "NudgePlanStatus" NOT NULL DEFAULT 'planned',
    "reason" TEXT,
    "origin" "NudgePlanOrigin" NOT NULL DEFAULT 'server',
    "push_ticket_id" TEXT,
    "push_sent_at" TIMESTAMP(3),
    "push_delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nudge_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "nudge_plan_id" UUID,
    "local_id" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "distance_meters" DOUBLE PRECISION,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "calories" DOUBLE PRECISION,
    "used_location" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "client_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crash_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "is_fatal" BOOLEAN NOT NULL DEFAULT false,
    "context" JSONB,
    "client_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crash_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "nudge_plan_id" UUID,
    "event_type" "BehaviorEventType" NOT NULL,
    "payload" JSONB,
    "client_timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "study_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "study_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_aggregations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "total_active_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "total_distance_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "nudges_planned" INTEGER NOT NULL DEFAULT 0,
    "nudges_delivered" INTEGER NOT NULL DEFAULT 0,
    "nudges_opened" INTEGER NOT NULL DEFAULT 0,
    "nudges_skipped" INTEGER NOT NULL DEFAULT 0,
    "goal_reached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_aggregations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_aggregations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "week_start" TEXT NOT NULL,
    "total_active_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "total_distance_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "days_active" INTEGER NOT NULL DEFAULT 0,
    "adherence_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_aggregations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "nudge_plan_id" UUID,
    "expo_push_token" TEXT NOT NULL,
    "ticket_id" TEXT,
    "status" "PushStatus" NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "receipt_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX "devices_user_id_expo_push_token_key" ON "devices"("user_id", "expo_push_token");
CREATE UNIQUE INDEX "schedule_sources_user_id_key" ON "schedule_sources"("user_id");
CREATE UNIQUE INDEX "preferences_user_id_key" ON "preferences"("user_id");
CREATE UNIQUE INDEX "walk_sessions_nudge_plan_id_key" ON "walk_sessions"("nudge_plan_id");
CREATE UNIQUE INDEX "study_enrollments_study_id_user_id_key" ON "study_enrollments"("study_id", "user_id");
CREATE UNIQUE INDEX "daily_aggregations_user_id_date_key" ON "daily_aggregations"("user_id", "date");
CREATE UNIQUE INDEX "weekly_aggregations_user_id_week_start_key" ON "weekly_aggregations"("user_id", "week_start");

-- CreateIndex (non-unique)
CREATE INDEX "busy_events_user_id_start_idx" ON "busy_events"("user_id", "start");
CREATE INDEX "busy_events_user_id_source_idx" ON "busy_events"("user_id", "source");
CREATE INDEX "manual_schedule_entries_user_id_idx" ON "manual_schedule_entries"("user_id");
CREATE INDEX "nudge_plans_user_id_date_idx" ON "nudge_plans"("user_id", "date");
CREATE INDEX "nudge_plans_user_id_status_idx" ON "nudge_plans"("user_id", "status");
CREATE INDEX "nudge_plans_date_status_idx" ON "nudge_plans"("date", "status");
CREATE INDEX "walk_sessions_user_id_start_idx" ON "walk_sessions"("user_id", "start");
CREATE INDEX "analytics_events_user_id_name_idx" ON "analytics_events"("user_id", "name");
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");
CREATE INDEX "crash_reports_user_id_idx" ON "crash_reports"("user_id");
CREATE INDEX "crash_reports_created_at_idx" ON "crash_reports"("created_at");
CREATE INDEX "behavior_logs_user_id_event_type_idx" ON "behavior_logs"("user_id", "event_type");
CREATE INDEX "behavior_logs_nudge_plan_id_idx" ON "behavior_logs"("nudge_plan_id");
CREATE INDEX "behavior_logs_created_at_idx" ON "behavior_logs"("created_at");
CREATE INDEX "daily_aggregations_user_id_idx" ON "daily_aggregations"("user_id");
CREATE INDEX "daily_aggregations_date_idx" ON "daily_aggregations"("date");
CREATE INDEX "weekly_aggregations_user_id_idx" ON "weekly_aggregations"("user_id");
CREATE INDEX "push_logs_user_id_idx" ON "push_logs"("user_id");
CREATE INDEX "push_logs_nudge_plan_id_idx" ON "push_logs"("nudge_plan_id");
CREATE INDEX "push_logs_status_idx" ON "push_logs"("status");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_sources" ADD CONSTRAINT "schedule_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "busy_events" ADD CONSTRAINT "busy_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_schedule_entries" ADD CONSTRAINT "manual_schedule_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nudge_plans" ADD CONSTRAINT "nudge_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "walk_sessions" ADD CONSTRAINT "walk_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "walk_sessions" ADD CONSTRAINT "walk_sessions_nudge_plan_id_fkey" FOREIGN KEY ("nudge_plan_id") REFERENCES "nudge_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crash_reports" ADD CONSTRAINT "crash_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "behavior_logs" ADD CONSTRAINT "behavior_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_enrollments" ADD CONSTRAINT "study_enrollments_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_enrollments" ADD CONSTRAINT "study_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
