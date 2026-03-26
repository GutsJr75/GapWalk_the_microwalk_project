DO $$
DECLARE
    legacy_column_name TEXT := 'auth' || '0_sub';
    legacy_index_name TEXT := 'users_' || legacy_column_name || '_key';
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name = legacy_column_name
    ) THEN
        EXECUTE format(
            'ALTER TABLE "users" RENAME COLUMN %I TO "firebase_uid"',
            legacy_column_name
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'users'
          AND indexname = legacy_index_name
    ) THEN
        EXECUTE format('DROP INDEX IF EXISTS %I', legacy_index_name);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_key" ON "users"("firebase_uid");
