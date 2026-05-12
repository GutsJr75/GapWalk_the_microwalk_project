import { getDatabase, withTransaction } from '../db';
import { NudgePlan, NudgePlanStatus, WalkSession } from '../../types';
import { addMinutes, format } from 'date-fns';

const mapRowToPlan = (row: {
  id: string;
  date: string;
  gap_start: string;
  gap_end: string;
  walk_start: string;
  suggested_duration_minutes: number;
  manual_notify_lead_minutes: number;
  notifications_enabled: number;
  status: string;
  reason: string | null;
  created_at: string;
}): NudgePlan => ({
  id: row.id,
  date: row.date,
  gapStart: row.gap_start,
  gapEnd: row.gap_end,
  walkStart: row.walk_start,
  suggestedDurationMinutes: row.suggested_duration_minutes,
  manualNotifyLeadMinutes: row.manual_notify_lead_minutes ?? 0,
  notificationsEnabled: row.notifications_enabled !== 0,
  status: row.status as NudgePlanStatus,
  reason: row.reason || undefined,
  createdAt: row.created_at,
});

const COMPLETABLE_PLAN_STATUSES = new Set<NudgePlanStatus>(['planned', 'notified', 'started']);

const getPlanWalkEndMs = (plan: NudgePlan): number => {
  const walkStart = new Date(plan.walkStart);
  const gapEndMs = new Date(plan.gapEnd).getTime();
  return Math.min(addMinutes(walkStart, Math.max(1, plan.suggestedDurationMinutes)).getTime(), gapEndMs);
};

const getOverlapMs = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number => Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

export const plansRepo = {
  async save(plan: NudgePlan): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO nudge_plans 
       (id, date, gap_start, gap_end, walk_start, suggested_duration_minutes,
        manual_notify_lead_minutes, notifications_enabled,
        status, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.id,
        plan.date,
        plan.gapStart,
        plan.gapEnd,
        plan.walkStart,
        plan.suggestedDurationMinutes,
        plan.manualNotifyLeadMinutes ?? 0,
        plan.notificationsEnabled === false ? 0 : 1,
        plan.status,
        plan.reason || null,
        plan.createdAt,
      ]
    );
  },
  
  async saveMany(plans: NudgePlan[]): Promise<void> {
    if (plans.length === 0) return;
    await withTransaction(async (db) => {
      for (const plan of plans) {
        await db.runAsync(
          `INSERT OR REPLACE INTO nudge_plans
           (id, date, gap_start, gap_end, walk_start, suggested_duration_minutes,
            manual_notify_lead_minutes, notifications_enabled,
            status, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [plan.id, plan.date, plan.gapStart, plan.gapEnd, plan.walkStart,
           plan.suggestedDurationMinutes, plan.manualNotifyLeadMinutes ?? 0,
           plan.notificationsEnabled === false ? 0 : 1,
           plan.status, plan.reason || null, plan.createdAt]
        );
      }
    });
  },
  
  async getById(id: string): Promise<NudgePlan | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>('SELECT * FROM nudge_plans WHERE id = ?', [id]);
    
    if (!row) return null;
    
    return mapRowToPlan(row);
  },
  
  async getTodayPlans(): Promise<NudgePlan[]> {
    const db = await getDatabase();
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      'SELECT * FROM nudge_plans WHERE date = ? ORDER BY walk_start ASC',
      [today]
    );
    
    return rows.map(mapRowToPlan);
  },

  async getByDate(date: string): Promise<NudgePlan[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      'SELECT * FROM nudge_plans WHERE date = ? ORDER BY walk_start ASC',
      [date]
    );

    return rows.map(mapRowToPlan);
  },

  async getByReasonSince(reason: string, sinceIso: string, limit = 200): Promise<NudgePlan[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM nudge_plans
       WHERE reason = ? AND walk_start >= ?
       ORDER BY walk_start DESC
       LIMIT ?`,
      [reason, sinceIso, limit],
    );

    return rows.map(mapRowToPlan);
  },
  
  async getUpcomingPlans(limit = 3): Promise<NudgePlan[]> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    
    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM nudge_plans 
       WHERE gap_end > ? AND status IN ('planned', 'notified', 'started')
       ORDER BY walk_start ASC LIMIT ?`,
      [now, limit]
    );
    
    return rows.map(mapRowToPlan);
  },

  async getUpcomingPlansThrough(endIso: string, limit = 200): Promise<NudgePlan[]> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const rows = await db.getAllAsync<{
      id: string;
      date: string;
      gap_start: string;
      gap_end: string;
      walk_start: string;
      suggested_duration_minutes: number;
      manual_notify_lead_minutes: number;
      notifications_enabled: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM nudge_plans
       WHERE gap_end > ? AND walk_start <= ? AND status IN ('planned', 'notified', 'started')
       ORDER BY walk_start ASC LIMIT ?`,
      [now, endIso, limit]
    );

    return rows.map(mapRowToPlan);
  },

  async findBestMatchingPlanForSession(session: Pick<WalkSession, 'start' | 'end'>): Promise<NudgePlan | null> {
    const sessionStartMs = new Date(session.start).getTime();
    const sessionEndMs = new Date(session.end).getTime();
    if (Number.isNaN(sessionStartMs) || Number.isNaN(sessionEndMs) || sessionEndMs <= sessionStartMs) {
      return null;
    }

    const candidateDates = Array.from(new Set([
      format(new Date(session.start), 'yyyy-MM-dd'),
      format(new Date(session.end), 'yyyy-MM-dd'),
    ]));
    const candidatePlans = (await Promise.all(
      candidateDates.map((date) => plansRepo.getByDate(date)),
    ))
      .flat()
      .filter((plan) => COMPLETABLE_PLAN_STATUSES.has(plan.status));

    let bestPlan: NudgePlan | null = null;
    let bestOverlapMs = 0;
    let bestStartDistanceMs = Number.POSITIVE_INFINITY;

    for (const plan of candidatePlans) {
      const walkStartMs = new Date(plan.walkStart).getTime();
      const walkEndMs = getPlanWalkEndMs(plan);
      if (Number.isNaN(walkStartMs) || Number.isNaN(walkEndMs) || walkEndMs <= walkStartMs) {
        continue;
      }

      const overlapMs = getOverlapMs(sessionStartMs, sessionEndMs, walkStartMs, walkEndMs);
      if (overlapMs <= 0) {
        continue;
      }

      const startDistanceMs = Math.abs(sessionStartMs - walkStartMs);
      if (
        overlapMs > bestOverlapMs ||
        (overlapMs === bestOverlapMs && startDistanceMs < bestStartDistanceMs)
      ) {
        bestPlan = plan;
        bestOverlapMs = overlapMs;
        bestStartDistanceMs = startDistanceMs;
      }
    }

    return bestPlan;
  },
  
  async updateStatus(id: string, status: NudgePlanStatus): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE nudge_plans SET status = ? WHERE id = ?',
      [status, id]
    );
  },

  async updateStatusWithReason(id: string, status: NudgePlanStatus, reason: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE nudge_plans SET status = ?, reason = ? WHERE id = ?',
      [status, reason, id]
    );
  },

  async updateTiming(
    id: string,
    timing: {
      gapStart: string;
      gapEnd: string;
      walkStart: string;
      suggestedDurationMinutes: number;
      manualNotifyLeadMinutes?: number;
      notificationsEnabled?: boolean;
      reason?: string;
      status?: NudgePlanStatus;
    }
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE nudge_plans
       SET gap_start = ?, gap_end = ?, walk_start = ?, suggested_duration_minutes = ?,
           manual_notify_lead_minutes = ?, notifications_enabled = COALESCE(?, notifications_enabled), reason = ?, status = ?
       WHERE id = ?`,
      [
        timing.gapStart,
        timing.gapEnd,
        timing.walkStart,
        timing.suggestedDurationMinutes,
        timing.manualNotifyLeadMinutes ?? 0,
        timing.notificationsEnabled == null ? null : (timing.notificationsEnabled ? 1 : 0),
        timing.reason ?? null,
        timing.status ?? 'planned',
        id,
      ]
    );
  },
  
  async getTodayNotifiedCount(): Promise<number> {
    const db = await getDatabase();
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM nudge_plans 
       WHERE date = ? AND status IN ('notified', 'started', 'completed')`,
      [today]
    );
    
    return result?.count || 0;
  },
  
  async deleteByDate(date: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM nudge_plans WHERE date = ?', [date]);
  },

  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM nudge_plans');
  },
};
