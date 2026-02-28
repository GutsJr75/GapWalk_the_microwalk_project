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
      notification_min_gap_minutes INTEGER NOT NULL DEFAULT 60,
      quiet_hours_start TEXT NOT NULL DEFAULT '23:00',
      quiet_hours_end TEXT NOT NULL DEFAULT '06:00',
      min_walk_minutes INTEGER NOT NULL DEFAULT 6,
      preferred_walking_periods_enabled INTEGER NOT NULL DEFAULT 0,
      preferred_walking_periods_json TEXT DEFAULT '[]',
      strictness_mode TEXT NOT NULL DEFAULT 'easygoing',
      step_goal_enabled INTEGER NOT NULL DEFAULT 0,
      step_goal INTEGER NOT NULL DEFAULT 1000,
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
      steps INTEGER DEFAULT 0,
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
      is_one_time INTEGER DEFAULT 0,
      one_time_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Analytics events table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Crash reports table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS crash_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      is_fatal INTEGER DEFAULT 0,
      context_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Walk checkpoint table — stores in-progress session so it can be recovered
  // if the app is force-killed mid-walk.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS walk_checkpoint (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      session_id TEXT NOT NULL,
      plan_id TEXT,
      start_iso TEXT NOT NULL,
      session_start_ms INTEGER NOT NULL,
      total_paused_ms INTEGER NOT NULL DEFAULT 0,
      distance_meters REAL NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0,
      used_location INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_busy_events_start ON busy_events(start);
    CREATE INDEX IF NOT EXISTS idx_busy_events_source ON busy_events(source);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_date ON nudge_plans(date);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_status ON nudge_plans(status);
    CREATE INDEX IF NOT EXISTS idx_walk_sessions_start ON walk_sessions(start);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(name);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_created_at ON crash_reports(created_at);
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
  if (!db) return;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS crash_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      is_fatal INTEGER DEFAULT 0,
      context_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(name);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_created_at ON crash_reports(created_at);
  `);

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
  await ensureColumn('walk_sessions', 'steps', 'INTEGER DEFAULT 0');
  await ensureColumn('walk_sessions', 'calories', 'REAL');
  await ensureColumn('walk_sessions', 'used_location', 'INTEGER DEFAULT 0');
  await ensureColumn('walk_sessions', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // nudge_plans expansions
  await ensureColumn('nudge_plans', 'status', "TEXT NOT NULL DEFAULT 'planned'");
  await ensureColumn('nudge_plans', 'reason', 'TEXT');
  await ensureColumn('nudge_plans', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // manual_schedule_entries expansions
  await ensureColumn('manual_schedule_entries', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('manual_schedule_entries', 'is_one_time', 'INTEGER DEFAULT 0');
  await ensureColumn('manual_schedule_entries', 'one_time_date', 'TEXT');

  // preferences: new notification-related columns
  await ensureColumn('preferences', 'grace_period_minutes', 'INTEGER DEFAULT 2');
  await ensureColumn('preferences', 'when_to_notify', "TEXT DEFAULT 'now'");
  await ensureColumn('preferences', 'notify_delay_minutes', 'INTEGER DEFAULT 5');
  await ensureColumn('preferences', 'notification_min_gap_minutes', 'INTEGER DEFAULT 60');
  await ensureColumn('preferences', 'preferred_walking_periods_enabled', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('preferences', 'preferred_walking_periods_json', "TEXT DEFAULT '[]'");
  await ensureColumn('preferences', 'strictness_mode', "TEXT NOT NULL DEFAULT 'easygoing'");
  await ensureColumn('preferences', 'step_goal_enabled', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('preferences', 'step_goal', 'INTEGER NOT NULL DEFAULT 1000');

  // Achievements table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      unlocked_at TEXT NOT NULL
    );
  `);
};

/**
 * Run a callback inside an exclusive SQLite transaction.
 * If the callback throws, the transaction is rolled back and the error re-thrown.
 */
export const withTransaction = async <T>(
  fn: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> => {
  const instance = await getDatabase();
  let result: T;
  await instance.withExclusiveTransactionAsync(async () => {
    result = await fn(instance);
  });
  return result!;
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
    DROP TABLE IF EXISTS analytics_events;
    DROP TABLE IF EXISTS crash_reports;
    DROP TABLE IF EXISTS achievements;
    DROP TABLE IF EXISTS walk_checkpoint;
  `);

  await initializeTables();
};
