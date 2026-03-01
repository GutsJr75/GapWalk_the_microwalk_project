import { getDatabase } from '../db';

export const routeRepo = {
  async appendPoint(sessionId: string, latitude: number, longitude: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO walk_routes (session_id, latitude, longitude, recorded_at)
       VALUES (?, ?, ?, ?)`,
      [sessionId, latitude, longitude, new Date().toISOString()]
    );
  },

  async getBySessionId(sessionId: string): Promise<{ latitude: number; longitude: number }[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ latitude: number; longitude: number }>(
      `SELECT latitude, longitude FROM walk_routes WHERE session_id = ? ORDER BY id ASC`,
      [sessionId]
    );
    return rows;
  },

  async deleteBySessionId(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM walk_routes WHERE session_id = ?`, [sessionId]);
  },
};
