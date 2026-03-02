/**
 * Walk Checkpoint — persists in-progress walk session data to SQLite every ~30s
 * so that if the app is force-killed mid-walk, the session can be recovered
 * (partially) when the user re-opens the app.
 */
import { getDatabase } from '../data/db';
import { WalkSession } from '../types';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { plansRepo } from '../data/repositories/plansRepo';

export interface WalkCheckpointData {
  sessionId: string;
  planId?: string;
  startIso: string;
  sessionStartMs: number;
  totalPausedMs: number;
  distanceMeters: number;
  steps: number;
  paused: boolean;
  usedLocation: boolean;
}

/**
 * Save / update the in-progress walk checkpoint (upsert, single-row table).
 * Called every ~30 seconds from the WalkingScreen timer.
 */
export async function saveWalkCheckpoint(data: WalkCheckpointData): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO walk_checkpoint
       (id, session_id, plan_id, start_iso, session_start_ms, total_paused_ms,
        distance_meters, steps, paused, used_location, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.sessionId,
        data.planId ?? null,
        data.startIso,
        data.sessionStartMs,
        data.totalPausedMs,
        data.distanceMeters,
        data.steps,
        data.paused ? 1 : 0,
        data.usedLocation ? 1 : 0,
        new Date().toISOString(),
      ],
    );
  } catch (e) {
    if (__DEV__) console.warn('Failed to save walk checkpoint:', e);
  }
}

/**
 * Clear the checkpoint after a normal save/end of session.
 */
export async function clearWalkCheckpoint(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM walk_checkpoint');
  } catch (e) {
    if (__DEV__) console.warn('Failed to clear walk checkpoint:', e);
  }
}

/**
 * Recover an orphaned walk session from a checkpoint left by a force-killed app.
 * If a checkpoint exists:
 *   1. Converts it into a partial WalkSession and saves it to walk_sessions.
 *   2. Clears the checkpoint.
 *   3. Returns the recovered session (for analytics / UI toast).
 * Returns null if there was nothing to recover.
 */
export async function recoverOrphanedSession(): Promise<WalkSession | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      session_id: string;
      plan_id: string | null;
      start_iso: string;
      session_start_ms: number;
      total_paused_ms: number;
      distance_meters: number;
      steps: number;
      paused: number;
      used_location: number;
      updated_at: string;
    }>('SELECT * FROM walk_checkpoint WHERE id = 1');

    if (!row) return null;

    // If the session already exists, this checkpoint is stale. Remove it to
    // avoid overwriting good data on next launch.
    const alreadySaved = await sessionsRepo.getById(row.session_id);
    if (alreadySaved) {
      await clearWalkCheckpoint();
      return null;
    }

    // Compute active seconds: from session start to the checkpoint's updated_at,
    // minus paused time. If the checkpoint's updated_at is stale (which it will
    // be — it was written before the kill), we use that as the session end.
    const checkpointMs = new Date(row.updated_at).getTime();
    if (Number.isNaN(checkpointMs)) {
      await clearWalkCheckpoint();
      return null;
    }
    const totalElapsedMs = checkpointMs - row.session_start_ms;
    const activeMs = Math.max(0, totalElapsedMs - row.total_paused_ms);
    const activeSeconds = Math.floor(activeMs / 1000);
    const pausedSeconds = Math.floor(row.total_paused_ms / 1000);

    // Only recover if the session had meaningful activity (> 10s active)
    if (activeSeconds < 10) {
      await clearWalkCheckpoint();
      return null;
    }

    const baseSession: WalkSession = {
      id: row.session_id,
      nudgePlanId: row.plan_id ?? undefined,
      start: row.start_iso,
      end: row.updated_at, // best approximation of when the app died
      activeSeconds,
      pausedSeconds,
      distanceMeters: row.distance_meters || undefined,
      steps: row.steps || 0,
      usedLocation: row.used_location === 1,
      createdAt: row.updated_at,
      wasRecovered: true,
    };

    const matchedPlan = baseSession.nudgePlanId
      ? null
      : await plansRepo.findBestMatchingPlanForSession(baseSession);
    const session = matchedPlan
      ? { ...baseSession, nudgePlanId: matchedPlan.id }
      : baseSession;

    await sessionsRepo.save(session);

    if (session.nudgePlanId) {
      try {
        const linkedPlan = await plansRepo.getById(session.nudgePlanId);
        if (
          linkedPlan &&
          (linkedPlan.status === 'planned' ||
            linkedPlan.status === 'notified' ||
            linkedPlan.status === 'started')
        ) {
          await plansRepo.updateStatus(session.nudgePlanId, 'completed');
        }
      } catch (planErr) {
        if (__DEV__) console.warn('Failed to update recovered plan status:', planErr);
      }
    }

    await clearWalkCheckpoint();

    return session;
  } catch (e) {
    if (__DEV__) console.warn('Failed to recover orphaned session:', e);
    return null;
  }
}
