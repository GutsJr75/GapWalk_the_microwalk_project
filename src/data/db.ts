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

  // Create all tables and indexes in a single native call to avoid
  // Android GC releasing the native database handle between awaits.
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

    CREATE TABLE IF NOT EXISTS busy_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      source TEXT NOT NULL,
      is_all_day INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS nudge_plans (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      gap_start TEXT NOT NULL,
      gap_end TEXT NOT NULL,
      walk_start TEXT NOT NULL,
      suggested_duration_minutes INTEGER NOT NULL,
      manual_notify_lead_minutes INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'planned',
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS walk_routes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      latitude    REAL    NOT NULL,
      longitude   REAL    NOT NULL,
      accuracy_meters REAL,
      altitude_meters REAL,
      speed_mps   REAL,
      bearing_degrees REAL,
      recorded_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walk_pause_events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id            TEXT    NOT NULL,
      pause_started_at      TEXT    NOT NULL,
      pause_ended_at        TEXT,
      pause_duration_seconds INTEGER,
      pause_source          TEXT,
      pause_reason          TEXT,
      created_at            TEXT    DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      unlocked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_busy_events_start ON busy_events(start);
    CREATE INDEX IF NOT EXISTS idx_busy_events_source ON busy_events(source);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_date ON nudge_plans(date);
    CREATE INDEX IF NOT EXISTS idx_nudge_plans_status ON nudge_plans(status);
    CREATE INDEX IF NOT EXISTS idx_walk_sessions_start ON walk_sessions(start);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(name);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_created_at ON crash_reports(created_at);
    CREATE INDEX IF NOT EXISTS idx_walk_routes_session_id ON walk_routes(session_id);
    CREATE INDEX IF NOT EXISTS idx_walk_pause_events_session_id ON walk_pause_events(session_id);
  `);

  // Ensure older local databases are upgraded with newer columns.
  await runMigrations();
};

// Migration column definitions grouped by table.
const MIGRATION_COLUMNS: Record<string, [column: string, definition: string][]> = {
  schedule_source: [
    ['google_connected', 'INTEGER DEFAULT 0'],
    ['google_access_token', 'TEXT'],
    ['google_refresh_token', 'TEXT'],
    ['updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
  ],
  busy_events: [
    ['is_all_day', 'INTEGER DEFAULT 0'],
    ['created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
  ],
  preferences: [
    ['min_walk_minutes', 'INTEGER NOT NULL DEFAULT 6'],
    ['updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['grace_period_minutes', 'INTEGER DEFAULT 2'],
    ['when_to_notify', "TEXT DEFAULT 'now'"],
    ['notify_delay_minutes', 'INTEGER DEFAULT 5'],
    ['notification_min_gap_minutes', 'INTEGER DEFAULT 60'],
    ['preferred_walking_periods_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['preferred_walking_periods_json', "TEXT DEFAULT '[]'"],
    ['strictness_mode', "TEXT NOT NULL DEFAULT 'easygoing'"],
    ['step_goal_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['step_goal', 'INTEGER NOT NULL DEFAULT 1000'],
    ['end_walk_mode', "TEXT NOT NULL DEFAULT 'quick'"],
  ],
  walk_sessions: [
    ['distance_meters', 'REAL'],
    ['steps', 'INTEGER DEFAULT 0'],
    ['calories', 'REAL'],
    ['used_location', 'INTEGER DEFAULT 0'],
    ['created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['pause_count', 'INTEGER DEFAULT 0'],
    ['max_speed_mps', 'REAL'],
    ['avg_speed_mps', 'REAL'],
    ['elevation_gain_meters', 'REAL'],
    ['step_source', 'TEXT'],
    ['motion_confidence', 'TEXT'],
    ['sensor_health_at_start', 'TEXT'],
    ['was_recovered', 'INTEGER DEFAULT 0'],
    ['nudge_to_start_latency_seconds', 'INTEGER'],
  ],
  nudge_plans: [
    ['status', "TEXT NOT NULL DEFAULT 'planned'"],
    ['reason', 'TEXT'],
    ['created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['manual_notify_lead_minutes', 'INTEGER NOT NULL DEFAULT 0'],
    ['notifications_enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ],
  manual_schedule_entries: [
    ['created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['is_one_time', 'INTEGER DEFAULT 0'],
    ['one_time_date', 'TEXT'],
  ],
  walk_routes: [
    ['accuracy_meters', 'REAL'],
    ['altitude_meters', 'REAL'],
    ['speed_mps', 'REAL'],
    ['bearing_degrees', 'REAL'],
  ],
};

const runMigrations = async () => {
  if (!db) return;

  // Fetch existing columns for all tables that need migration in one loop.
  // Each getAllAsync is a single native round-trip; we minimise the total count.
  const tableColumns: Record<string, Set<string>> = {};
  const tables = Object.keys(MIGRATION_COLUMNS);
  for (const table of tables) {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    tableColumns[table] = new Set(cols.map((c) => c.name));
  }

  // Collect only the ALTER statements actually needed.
  const alters: string[] = [];
  for (const table of tables) {
    const existing = tableColumns[table];
    for (const [column, definition] of MIGRATION_COLUMNS[table]) {
      if (!existing.has(column)) {
        alters.push(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  }

  // Execute all pending ALTERs in a single native call.
  if (alters.length > 0) {
    await db.execAsync(alters.join(';\n') + ';');
  }
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
  if (Platform.OS === 'web') {
    // expo-sqlite web adapter doesn't support exclusive transactions.
    await instance.withTransactionAsync(async () => {
      result = await fn(instance);
    });
    return result!;
  }
  await instance.withExclusiveTransactionAsync(async () => {
    result = await fn(instance);
  });
  return result!;
};
