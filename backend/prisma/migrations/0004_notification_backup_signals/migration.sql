ALTER TABLE "nudge_plans"
ADD COLUMN "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "local_reminder_scheduled_at" TIMESTAMP(3),
ADD COLUMN "local_reminder_delivered_at" TIMESTAMP(3);
