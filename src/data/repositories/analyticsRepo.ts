import { getDatabase } from '../db';

export interface AnalyticsEventRecord {
  id?: number;
  name: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface CrashReportRecord {
  id?: number;
  message: string;
  stack?: string;
  isFatal?: boolean;
  context?: Record<string, unknown>;
  createdAt?: string;
}

const toJson = (value: unknown): string | null => {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const fromJson = <T>(value: string | null): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export const analyticsRepo = {
  async saveEvent(event: AnalyticsEventRecord): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO analytics_events (name, payload_json, created_at)
       VALUES (?, ?, ?)`,
      [event.name, toJson(event.payload), event.createdAt || new Date().toISOString()]
    );
  },

  async saveCrash(report: CrashReportRecord): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO crash_reports (message, stack, is_fatal, context_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        report.message,
        report.stack || null,
        report.isFatal ? 1 : 0,
        toJson(report.context),
        report.createdAt || new Date().toISOString(),
      ]
    );
  },

  async getRecentEvents(limit = 100): Promise<AnalyticsEventRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      name: string;
      payload_json: string | null;
      created_at: string;
    }>(
      `SELECT id, name, payload_json, created_at
       FROM analytics_events
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      payload: fromJson<Record<string, unknown>>(row.payload_json),
      createdAt: row.created_at,
    }));
  },

  async getRecentCrashes(limit = 50): Promise<CrashReportRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      message: string;
      stack: string | null;
      is_fatal: number;
      context_json: string | null;
      created_at: string;
    }>(
      `SELECT id, message, stack, is_fatal, context_json, created_at
       FROM crash_reports
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      stack: row.stack || undefined,
      isFatal: row.is_fatal === 1,
      context: fromJson<Record<string, unknown>>(row.context_json),
      createdAt: row.created_at,
    }));
  },
};
