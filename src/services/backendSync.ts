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
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { scheduleSourceRepo } from '../data/repositories/scheduleSourceRepo';
import { manualScheduleRepo } from '../data/repositories/manualScheduleRepo';
import { analyticsRepo } from '../data/repositories/analyticsRepo';
import { WalkSession, NudgePlan, BusyEvent } from '../types';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function apiFetch(path: string, body: unknown, token: string, method: string = 'POST') {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
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
    const [storedUser, lastSyncedAt] = await Promise.all([
      authStorage.getUser(),
      authStorage.getLastSyncedAt(),
    ]);
    const [sessions, plans, events, preferences, scheduleSource, manualEntries, analyticsEvents, crashReports] = await Promise.all([
      sessionsRepo.getAll(),
      plansRepo.getUpcomingPlans(200),
      eventsRepo.getAll(),
      preferencesRepo.get(),
      scheduleSourceRepo.get(),
      manualScheduleRepo.getAll(),
      analyticsRepo.getRecentEvents(500),
      analyticsRepo.getRecentCrashes(100),
    ]) as [WalkSession[], NudgePlan[], BusyEvent[], Awaited<ReturnType<typeof preferencesRepo.get>>, Awaited<ReturnType<typeof scheduleSourceRepo.get>>, Awaited<ReturnType<typeof manualScheduleRepo.getAll>>, Awaited<ReturnType<typeof analyticsRepo.getRecentEvents>>, Awaited<ReturnType<typeof analyticsRepo.getRecentCrashes>>];

    // Build walk sessions with nested pause events + route points
    const walkSessions = await Promise.all(
      sessions.map(async (session: WalkSession) => {
        const [pauses, route] = await Promise.all([
          pauseEventsRepo.getBySessionId(session.id),
          routeRepo.getBySessionId(session.id),
        ]);

        return {
          localId: session.id,
          nudgePlanId: session.nudgePlanId,
          start: session.start,
          endTime: session.end,
          activeSeconds: session.activeSeconds,
          pausedSeconds: session.pausedSeconds,
          distanceMeters: session.distanceMeters,
          steps: session.steps,
          calories: session.calories,
          usedLocation: session.usedLocation,
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
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
      ...(storedUser?.email || storedUser?.name
        ? { userProfile: { email: storedUser.email, displayName: storedUser.name } }
        : {}),
      walkSessions,
      nudgePlans: plans.map((p: NudgePlan) => ({
        localId: p.id,
        date: p.date,
        gapStart: p.gapStart,
        gapEnd: p.gapEnd,
        walkStart: p.walkStart,
        suggestedDurationMinutes: p.suggestedDurationMinutes,
        status: p.status,
        reason: p.reason,
      })),
      busyEvents: events.map((e: BusyEvent) => ({
        localId: e.id,
        title: e.title,
        start: e.start,
        endTime: e.end,
        source: e.source,
        isAllDay: e.isAllDay,
      })),
      achievements,
      // ── Previously missing data categories ──
      ...(preferences
        ? {
            preferences: {
              dailyTargetMinutes: preferences.dailyTargetMinutes,
              bufferMinutes: preferences.bufferMinutes,
              notificationCountPerDay: preferences.notificationCountPerDay,
              notificationMinGapMinutes: preferences.notificationMinGapMinutes,
              quietHoursStart: preferences.quietHoursStart,
              quietHoursEnd: preferences.quietHoursEnd,
              minWalkMinutes: preferences.minWalkMinutes,
              gracePeriodMinutes: preferences.gracePeriodMinutes,
              whenToNotify: preferences.whenToNotify,
              notifyDelayMinutes: preferences.notifyDelayMinutes,
              strictnessMode: preferences.strictnessMode,
              stepGoalEnabled: preferences.stepGoalEnabled,
              stepGoal: preferences.stepGoal,
              preferredWalkingPeriods: preferences.preferredWalkingPeriods,
            },
          }
        : {}),
      ...(scheduleSource
        ? {
            scheduleSource: {
              type: scheduleSource.type,
              filename: scheduleSource.filename,
            },
          }
        : {}),
      manualScheduleEntries: manualEntries.map((e) => ({
        localId: e.id,
        title: e.title,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
        isOneTime: e.isOneTime,
        oneTimeDate: e.oneTimeDate,
      })),
      analyticsEvents: analyticsEvents.map((ev) => ({
        name: ev.name,
        payload: ev.payload,
        clientCreatedAt: ev.createdAt,
      })),
      crashReports: crashReports.map((cr) => ({
        message: cr.message,
        stack: cr.stack,
        isFatal: cr.isFatal,
        context: cr.context,
        clientCreatedAt: cr.createdAt,
      })),
    };

    const result = await apiFetch('/sync', syncPayload, token);
    if (result?.syncedAt) {
      await authStorage.saveLastSyncedAt(result.syncedAt);
    }
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[BackendSync] Sync failed:', error);
    return false;
  }
}

/**
 * Register or update device push token with the backend (POST /api/devices).
 * Should be called during app bootstrap after auth is restored and push
 * permissions have been granted. Safe to call multiple times — the backend
 * upserts on (userId, expoPushToken).
 */
export async function registerDevice(params: {
  expoPushToken: string;
  platform: 'ios' | 'android';
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  notificationPermissionGranted?: boolean;
  locationPermissionLevel?: string;
  activityPermissionGranted?: boolean;
  timezone?: string;
}): Promise<boolean> {
  const token = await authStorage.getToken();
  if (!token) return false;

  try {
    await apiFetch('/devices', params, token);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[BackendSync] Device registration failed:', error);
    return false;
  }
}
