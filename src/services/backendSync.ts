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
import { firebaseAuthService } from './firebaseAuth';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

const RAW_API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
const API_BASE = RAW_API_BASE.replace(/\/+$/, '');
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const ANDROID_EMULATOR_LOOPBACK = '10.0.2.2';

let lastBackendConfigWarning: string | null = null;

const warnBackendConfigurationOnce = (message: string): void => {
  if (!__DEV__ || lastBackendConfigWarning === message) return;
  lastBackendConfigWarning = message;
  console.warn(`[BackendSync] ${message}`);
};

const parseApiBase = (): URL | null => {
  if (!API_BASE) return null;
  try {
    return new URL(API_BASE);
  } catch {
    return null;
  }
};

export const isBackendSyncEnabled = (): boolean => API_BASE.length > 0;

export const getBackendConfigurationError = (): string | null => {
  if (!API_BASE) return null;

  const parsed = parseApiBase();
  if (!parsed) {
    return `EXPO_PUBLIC_API_URL is invalid: "${RAW_API_BASE}".`;
  }

  if (Platform.OS !== 'android') return null;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === ANDROID_EMULATOR_LOOPBACK && Device.isDevice) {
    return 'EXPO_PUBLIC_API_URL uses 10.0.2.2, which only works on the Android emulator. Use your computer\'s LAN IP on a physical Android device.';
  }

  if (LOCALHOST_HOSTS.has(hostname)) {
    return Device.isDevice
      ? 'EXPO_PUBLIC_API_URL uses localhost, which points at the Android device itself. Use your computer\'s LAN IP instead.'
      : 'EXPO_PUBLIC_API_URL uses localhost, which does not reach your computer from the Android emulator. Use http://10.0.2.2:3000 instead.';
  }

  if (!__DEV__ && parsed.protocol === 'http:') {
    return 'EXPO_PUBLIC_API_URL uses http://, but Android preview/release builds block cleartext traffic by default. Use https:// or allow cleartext traffic for that build variant.';
  }

  return null;
};

export const canUseBackendSync = (): boolean =>
  isBackendSyncEnabled() && getBackendConfigurationError() === null;

const ensureBackendApiBase = (): string => {
  if (!API_BASE) {
    throw new Error('Backend API is not configured. Add EXPO_PUBLIC_API_URL to enable research sync.');
  }

  const configurationError = getBackendConfigurationError();
  if (configurationError) {
    warnBackendConfigurationOnce(configurationError);
    throw new Error(configurationError);
  }

  return API_BASE;
};

const buildNetworkFailureMessage = (apiBase: string, error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.toLowerCase().includes('network request failed')) {
    return raw;
  }

  if (Platform.OS === 'android') {
    return `Unable to reach backend at ${apiBase}. Make sure the server is running and reachable from this ${Device.isDevice ? 'device' : 'emulator'}.`;
  }

  return `Unable to reach backend at ${apiBase}. Make sure the server is running and reachable from this client.`;
};

export async function apiFetch(
  path: string,
  body: unknown,
  method: string = 'POST'
) {
  const apiBase = ensureBackendApiBase();
  const token = await firebaseAuthService.getIdToken();
  if (!token) {
    throw new Error('Session expired. Please sign in again.');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(buildNetworkFailureMessage(apiBase, error));
  }

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
  const configurationError = getBackendConfigurationError();
  if (!isBackendSyncEnabled()) return false;
  if (configurationError) {
    warnBackendConfigurationOnce(configurationError);
    return false;
  }

  const token = await firebaseAuthService.getIdToken();
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

    const result = await apiFetch('/sync', syncPayload);
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
  const configurationError = getBackendConfigurationError();
  if (!isBackendSyncEnabled()) return false;
  if (configurationError) {
    warnBackendConfigurationOnce(configurationError);
    return false;
  }

  const token = await firebaseAuthService.getIdToken();
  if (!token) return false;

  try {
    await apiFetch('/devices', params);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[BackendSync] Device registration failed:', error);
    return false;
  }
}
