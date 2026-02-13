import { getDatabase } from '../db';
import { BusyEvent, ScheduleSourceType } from '../types';

export const eventsRepo = {
  async save(event: BusyEvent): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO busy_events 
       (id, title, start, end, source, is_all_day, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.title,
        event.start,
        event.end,
        event.source,
        event.isAllDay ? 1 : 0,
        event.createdAt,
      ]
    );
  },
  
  async saveMany(events: BusyEvent[]): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  },
  
  async getAll(): Promise<BusyEvent[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      start: string;
      end: string;
      source: string;
      is_all_day: number;
      created_at: string;
    }>('SELECT * FROM busy_events ORDER BY start ASC');
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      start: row.start,
      end: row.end,
      source: row.source as ScheduleSourceType,
      isAllDay: row.is_all_day === 1,
      createdAt: row.created_at,
    }));
  },
  
  async getByDateRange(startDate: string, endDate: string): Promise<BusyEvent[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      start: string;
      end: string;
      source: string;
      is_all_day: number;
      created_at: string;
    }>(
      `SELECT * FROM busy_events 
       WHERE start >= ? AND start < ? 
       ORDER BY start ASC`,
      [startDate, endDate]
    );
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      start: row.start,
      end: row.end,
      source: row.source as ScheduleSourceType,
      isAllDay: row.is_all_day === 1,
      createdAt: row.created_at,
    }));
  },
  
  async deleteBySource(source: ScheduleSourceType): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM busy_events WHERE source = ?', [source]);
  },
  
  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM busy_events');
  },
  
  async count(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM busy_events'
    );
    return result?.count || 0;
  },
};
