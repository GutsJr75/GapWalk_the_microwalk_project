import { getDatabase } from '../db';
import { ScheduleSource, ScheduleSourceType } from '../../types';

export const scheduleSourceRepo = {
  async save(source: ScheduleSource): Promise<void> {
    const db = await getDatabase();
    
    // First delete any existing source
    await db.runAsync('DELETE FROM schedule_source');
    
    // Then insert the new one
    await db.runAsync(
      `INSERT INTO schedule_source 
       (type, filename, last_imported_at, google_connected, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        source.type,
        source.filename || null,
        source.lastImportedAt || null,
        source.googleConnected ? 1 : 0,
      ]
    );
  },
  
  async get(): Promise<ScheduleSource | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      type: string;
      filename: string | null;
      last_imported_at: string | null;
      google_connected: number;
    }>('SELECT * FROM schedule_source ORDER BY id DESC LIMIT 1');
    
    if (!row) return null;
    
    return {
      type: row.type as ScheduleSourceType,
      filename: row.filename || undefined,
      lastImportedAt: row.last_imported_at || undefined,
      googleConnected: row.google_connected === 1,
    };
  },
  
  async exists(): Promise<boolean> {
    const source = await this.get();
    return source !== null;
  },
  
  async clear(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM schedule_source');
  },
};
