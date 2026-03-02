import { getDatabase } from '../db';

export interface RoutePoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  speedMps?: number;
  bearingDegrees?: number;
  recordedAt: string;
}

export const routeRepo = {
  async appendPoint(sessionId: string, point: RoutePoint): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO walk_routes
         (session_id, latitude, longitude, accuracy_meters, altitude_meters,
          speed_mps, bearing_degrees, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        point.latitude,
        point.longitude,
        point.accuracyMeters ?? null,
        point.altitudeMeters ?? null,
        point.speedMps ?? null,
        point.bearingDegrees ?? null,
        point.recordedAt,
      ],
    );
  },

  async getBySessionId(sessionId: string): Promise<RoutePoint[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      latitude: number;
      longitude: number;
      accuracy_meters: number | null;
      altitude_meters: number | null;
      speed_mps: number | null;
      bearing_degrees: number | null;
      recorded_at: string;
    }>(
      `SELECT latitude, longitude, accuracy_meters, altitude_meters,
              speed_mps, bearing_degrees, recorded_at
       FROM walk_routes WHERE session_id = ? ORDER BY id ASC`,
      [sessionId],
    );
    return rows.map((r) => ({
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyMeters: r.accuracy_meters ?? undefined,
      altitudeMeters: r.altitude_meters ?? undefined,
      speedMps: r.speed_mps ?? undefined,
      bearingDegrees: r.bearing_degrees ?? undefined,
      recordedAt: r.recorded_at,
    }));
  },

  async deleteBySessionId(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM walk_routes WHERE session_id = ?`, [sessionId]);
  },
};
