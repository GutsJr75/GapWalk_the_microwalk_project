import { getDatabase } from '../db';
import { NudgePlan, NudgePlanStatus } from '../types';
import { format, startOfDay, endOfDay } from 'date-fns';

export const plansRepo = {
  async save(plan: NudgePlan): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO nudge_plans 
       (id, date, gap_start, gap_end, walk_start, suggested_duration_minutes, 
        status, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.id,
        plan.date,
        plan.gapStart,
        plan.gapEnd,
        plan.walkStart,
        plan.suggestedDurationMinutes,
        plan.status,
        plan.reason || null,
        plan.createdAt,
      ]
    );
  },
  
  async saveMany(plans: NudgePlan[]): Promise<void> {
    for (const plan of plans) {
      await this.save(plan);
    }
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
      status: string;
      reason: string | null;
      created_at: string;
    }>('SELECT * FROM nudge_plans WHERE id = ?', [id]);
    
    if (!row) return null;
    
    return {
      id: row.id,
      date: row.date,
      gapStart: row.gap_start,
      gapEnd: row.gap_end,
      walkStart: row.walk_start,
      suggestedDurationMinutes: row.suggested_duration_minutes,
      status: row.status as NudgePlanStatus,
      reason: row.reason || undefined,
      createdAt: row.created_at,
    };
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
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      'SELECT * FROM nudge_plans WHERE date = ? ORDER BY walk_start ASC',
      [today]
    );
    
    return rows.map(row => ({
      id: row.id,
      date: row.date,
      gapStart: row.gap_start,
      gapEnd: row.gap_end,
      walkStart: row.walk_start,
      suggestedDurationMinutes: row.suggested_duration_minutes,
      status: row.status as NudgePlanStatus,
      reason: row.reason || undefined,
      createdAt: row.created_at,
    }));
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
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      'SELECT * FROM nudge_plans WHERE date = ? ORDER BY walk_start ASC',
      [date]
    );

    return rows.map(row => ({
      id: row.id,
      date: row.date,
      gapStart: row.gap_start,
      gapEnd: row.gap_end,
      walkStart: row.walk_start,
      suggestedDurationMinutes: row.suggested_duration_minutes,
      status: row.status as NudgePlanStatus,
      reason: row.reason || undefined,
      createdAt: row.created_at,
    }));
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
      status: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT * FROM nudge_plans 
       WHERE walk_start > ? AND status IN ('planned', 'notified')
       ORDER BY walk_start ASC LIMIT ?`,
      [now, limit]
    );
    
    return rows.map(row => ({
      id: row.id,
      date: row.date,
      gapStart: row.gap_start,
      gapEnd: row.gap_end,
      walkStart: row.walk_start,
      suggestedDurationMinutes: row.suggested_duration_minutes,
      status: row.status as NudgePlanStatus,
      reason: row.reason || undefined,
      createdAt: row.created_at,
    }));
  },
  
  async updateStatus(id: string, status: NudgePlanStatus): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE nudge_plans SET status = ? WHERE id = ?',
      [status, id]
    );
  },

  async updateTiming(
    id: string,
    timing: {
      gapStart: string;
      gapEnd: string;
      walkStart: string;
      suggestedDurationMinutes: number;
      reason?: string;
      status?: NudgePlanStatus;
    }
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE nudge_plans
       SET gap_start = ?, gap_end = ?, walk_start = ?, suggested_duration_minutes = ?, reason = ?, status = ?
       WHERE id = ?`,
      [
        timing.gapStart,
        timing.gapEnd,
        timing.walkStart,
        timing.suggestedDurationMinutes,
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
};
