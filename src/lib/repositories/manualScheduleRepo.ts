import { getDatabase } from '../db';
import { ManualScheduleEntry } from '../types';

export const manualScheduleRepo = {
  async save(entry: ManualScheduleEntry): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO manual_schedule_entries 
       (id, title, day_of_week, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.title,
        entry.dayOfWeek,
        entry.startTime,
        entry.endTime,
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
    }>('SELECT * FROM manual_schedule_entries ORDER BY day_of_week, start_time');
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
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
