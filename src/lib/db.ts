import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  // If already initialised, return immediately.
  if (db) return db;

  // Prevent multiple concurrent initialisations via a shared promise.
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const instance = await SQLite.openDatabaseAsync('gapwalk.db');
      db = instance;
      await initializeTables();
      return instance;
    } catch (err) {
      // Reset so a future call can retry.
      db = null;
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};

const initializeTables = async () => {
  if (!db) return;

  // ScheduleSource table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schedule_source (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      filename TEXT,
      last_imported_at TEXT,
      google_connected INTEGER DEFAULT 0,
      google_access_token TEXT,
      google_refresh_token TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // BusyEvents table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS busy_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      source TEXT NOT NULL,
      is_all_day INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Preferences table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      daily_target_minutes INTEGER NOT NULL DEFAULT 20,
      buffer_minutes INTEGER NOT NULL DEFAULT 2,
      notification_count_per_day INTEGER NOT NULL DEFAULT 3,
      quiet_hours_start TEXT NOT NULL DEFAULT '23:00',
      quiet_hours_end TEXT NOT NULL DEFAULT '06:00',
      min_walk_minutes INTEGER NOT NULL DEFAULT 6,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // WalkSessions table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS walk_sessions (
      id TEXT PRIMARY KEY,
      nudge_plan_id TEXT,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      active_seconds INTEGER NOT NULL DEFAULT 0,
      paused_seconds INTEGER NOT NULL DEFAULT 0,
      distance_meters REAL,
      calories REAL,
      used_location INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // NudgePlans table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS nudge_plans (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      gap_start TEXT NOT NULL,
      gap_end TEXT NOT NULL,
      walk_start TEXT NOT NULL,
      suggested_duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ManualScheduleEntries table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS manual_schedule_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_busy_events_start ON busy_events(start);
    CREATE INDEX IF NOT EXISTS idx_busy_events_source ON busy_events(source);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_date ON nudge_plans(date);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_status ON nudge_plans(status);
    CREATE INDEX IF NOT EXISTS idx_walk_sessions_start ON walk_sessions(start);
  `);

  // Ensure older local databases are upgraded with newer columns.
  await runMigrations();
};

const ensureColumn = async (
  tableName: string,
  columnName: string,
  columnDefinition: string
) => {
  if (!db) return;
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const exists = cols.some((c) => c.name === columnName);
  if (!exists) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  }
};

const runMigrations = async () => {
  // schedule_source expansions
  await ensureColumn('schedule_source', 'google_connected', 'INTEGER DEFAULT 0');
  await ensureColumn('schedule_source', 'google_access_token', 'TEXT');
  await ensureColumn('schedule_source', 'google_refresh_token', 'TEXT');
  await ensureColumn('schedule_source', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // busy_events expansions
  await ensureColumn('busy_events', 'is_all_day', 'INTEGER DEFAULT 0');
  await ensureColumn('busy_events', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // preferences expansions
  await ensureColumn('preferences', 'min_walk_minutes', 'INTEGER NOT NULL DEFAULT 6');
  await ensureColumn('preferences', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // walk_sessions expansions
  await ensureColumn('walk_sessions', 'distance_meters', 'REAL');
  await ensureColumn('walk_sessions', 'calories', 'REAL');
  await ensureColumn('walk_sessions', 'used_location', 'INTEGER DEFAULT 0');
  await ensureColumn('walk_sessions', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // nudge_plans expansions
  await ensureColumn('nudge_plans', 'status', "TEXT NOT NULL DEFAULT 'planned'");
  await ensureColumn('nudge_plans', 'reason', 'TEXT');
  await ensureColumn('nudge_plans', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // manual_schedule_entries expansions
  await ensureColumn('manual_schedule_entries', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // preferences: new notification-related columns
  await ensureColumn('preferences', 'grace_period_minutes', 'INTEGER DEFAULT 2');
  await ensureColumn('preferences', 'when_to_notify', "TEXT DEFAULT 'now'");
  await ensureColumn('preferences', 'notify_delay_minutes', 'INTEGER DEFAULT 5');
};

export const isDatabaseAvailable = async (): Promise<boolean> => {
  try {
    const instance = await getDatabase();
    // Quick health check
    await instance.getFirstAsync<{ x: number }>('SELECT 1 as x');
    return true;
  } catch {
    return false;
  }
};

export const resetDatabase = async () => {
  if (!db) return;

  await db.execAsync(`
    DROP TABLE IF EXISTS schedule_source;
    DROP TABLE IF EXISTS busy_events;
    DROP TABLE IF EXISTS preferences;
    DROP TABLE IF EXISTS walk_sessions;
    DROP TABLE IF EXISTS nudge_plans;
    DROP TABLE IF EXISTS manual_schedule_entries;
  `);

  await initializeTables();
};
