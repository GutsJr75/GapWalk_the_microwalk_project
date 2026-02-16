import { getDatabase } from '../db';
import { ManualScheduleEntry } from '../types';

export const manualScheduleRepo = {
  async save(entry: ManualScheduleEntry): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO manual_schedule_entries 
       (id, title, day_of_week, start_time, end_time, is_one_time, one_time_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.title,
        entry.dayOfWeek,
        entry.startTime,
        entry.endTime,
        entry.isOneTime ? 1 : 0,
        entry.oneTimeDate ?? null,
        new Date().toISOString(),
      ]
    );
  },
  
  async saveMany(entries: ManualScheduleEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.save(entry);
    }
  },
  
  async getAll(): Promise<ManualScheduleEntry[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_one_time: number;
      one_time_date: string | null;
    }>(
      `SELECT * FROM manual_schedule_entries
       ORDER BY is_one_time ASC, COALESCE(one_time_date, ''), day_of_week, start_time`
    );
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      isOneTime: row.is_one_time === 1,
      oneTimeDate: row.one_time_date ?? undefined,
    }));
  },
  
  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM manual_schedule_entries');
  },
  
  async count(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM manual_schedule_entries'
    );
    return result?.count || 0;
  },
};
