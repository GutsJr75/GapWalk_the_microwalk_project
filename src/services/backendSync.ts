/**
 * backendSync.ts
 *
 * Syncs all locally-tracked data to the GapWalk backend.
 * Reads local SQLite, assembles the SyncRequestDto payload,
 * POSTs to POST /api/sync, and handles the response.
 *
 * Call `runBackendSync()` after each walk session completes,
 * on app foreground, or on a periodic timer.
 */

import { authStorage } from '../data/authStorage';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { pauseEventsRepo } from '../data/repositories/pauseEventsRepo';
import { routeRepo } from '../data/repositories/routeRepo';
import { achievementsRepo } from '../data/repositories/achievementsRepo';
import { WalkSession, NudgePlan, BusyEvent } from '../types';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch(path: string, body: unknown, token: string) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Backend sync failed [${response.status}]: ${text}`);
  }

  return response.json();
}

/**
 * Build the sync payload from local SQLite and POST it to /api/sync.
 * Returns true on success, false on failure (e.g. no auth token).
 */
export async function runBackendSync(): Promise<boolean> {
  const token = await authStorage.getToken();
  if (!token) return false;

  try {
    const [sessions, plans, events]: [WalkSession[], NudgePlan[], BusyEvent[]] = await Promise.all([
      sessionsRepo.getAll(),
      plansRepo.getUpcomingPlans(200),
      eventsRepo.getAll(),
    ]);

    // Build walk sessions with nested pause events + route points
    const walkSessions = await Promise.all(
      sessions.map(async (session: WalkSession) => {
        const [pauses, route] = await Promise.all([
          pauseEventsRepo.getBySessionId(session.id),
          routeRepo.getBySessionId(session.id),
        ]);

        return {
          id: session.id,
          nudgePlanId: session.nudgePlanId,
          start: session.start,
          end: session.end,
          activeSeconds: session.activeSeconds,
          pausedSeconds: session.pausedSeconds,
          distanceMeters: session.distanceMeters,
          steps: session.steps,
          calories: session.calories,
          usedLocation: session.usedLocation,
          createdAt: session.createdAt,
          pauseCount: session.pauseCount,
          maxSpeedMps: session.maxSpeedMps,
          avgSpeedMps: session.avgSpeedMps,
          elevationGainMeters: session.elevationGainMeters,
          stepSource: session.stepSource,
          motionConfidence: session.motionConfidence,
          sensorHealthAtStart: session.sensorHealthAtStart,
          wasRecovered: session.wasRecovered,
          nudgeToStartLatencySeconds: session.nudgeToStartLatencySeconds,
          pauseEvents: pauses.map((p) => ({
            pauseStartedAt: p.pauseStartedAt,
            pauseEndedAt: p.pauseEndedAt ?? undefined,
            pauseDurationSeconds: p.pauseDurationSeconds ?? undefined,
            pauseSource: p.pauseSource ?? undefined,
            pauseReason: p.pauseReason ?? undefined,
          })),
          routePoints: route.map((r) => ({
            latitude: r.latitude,
            longitude: r.longitude,
            accuracyMeters: r.accuracyMeters ?? undefined,
            altitudeMeters: r.altitudeMeters ?? undefined,
            speedMps: r.speedMps ?? undefined,
            bearingDegrees: r.bearingDegrees ?? undefined,
            recordedAt: r.recordedAt,
          })),
        };
      })
    );

    // Build achievements sync
    const allAchievements = await achievementsRepo.getAll();
    const achievements = allAchievements.map((a) => ({
      achievementId: a.id,
      unlockedAt: a.unlockedAt,
    }));

    const syncPayload = {
      walkSessions,
      nudgePlans: plans.map((p: NudgePlan) => ({
        id: p.id,
        date: p.date,
        gapStart: p.gapStart,
        gapEnd: p.gapEnd,
        walkStart: p.walkStart,
        suggestedDurationMinutes: p.suggestedDurationMinutes,
        status: p.status,
        reason: p.reason,
        createdAt: p.createdAt,
      })),
      busyEvents: events.map((e: BusyEvent) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        source: e.source,
        isAllDay: e.isAllDay,
        createdAt: e.createdAt,
      })),
      achievements,
    };

    await apiFetch('/sync', syncPayload, token);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[BackendSync] Sync failed:', error);
    return false;
  }
}
