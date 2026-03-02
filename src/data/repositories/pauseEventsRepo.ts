import { getDatabase } from '../db';

export interface WalkPauseEvent {
  id?: number;
  sessionId: string;
  pauseStartedAt: string;     // ISO
  pauseEndedAt?: string;       // ISO
  pauseDurationSeconds?: number;
  pauseSource?: string;        // 'screen' | 'auto_pause' | 'notification'
  pauseReason?: string;        // 'not_moving' | 'user_action' | 'phone_call'
  createdAt?: string;
}

export const pauseEventsRepo = {
  async save(event: WalkPauseEvent): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO walk_pause_events
         (session_id, pause_started_at, pause_ended_at, pause_duration_seconds,
          pause_source, pause_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.sessionId,
        event.pauseStartedAt,
        event.pauseEndedAt ?? null,
        event.pauseDurationSeconds ?? null,
        event.pauseSource ?? null,
        event.pauseReason ?? null,
        new Date().toISOString(),
      ],
    );
  },

  async getBySessionId(sessionId: string): Promise<WalkPauseEvent[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      session_id: string;
      pause_started_at: string;
      pause_ended_at: string | null;
      pause_duration_seconds: number | null;
      pause_source: string | null;
      pause_reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM walk_pause_events WHERE session_id = ? ORDER BY pause_started_at ASC`,
      [sessionId],
    );
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      pauseStartedAt: r.pause_started_at,
      pauseEndedAt: r.pause_ended_at ?? undefined,
      pauseDurationSeconds: r.pause_duration_seconds ?? undefined,
      pauseSource: r.pause_source ?? undefined,
      pauseReason: r.pause_reason ?? undefined,
      createdAt: r.created_at,
    }));
  },

  async deleteBySessionId(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM walk_pause_events WHERE session_id = ?`,
      [sessionId],
    );
  },
};
