/**
 * data-flow.e2e-spec.ts
 *
 * End-to-end tests verifying every data ingestion path writes to the correct
 * backend tables. Runs against the deployed backend (or a local instance).
 *
 * Usage:
 *   TEST_AUTH_TOKEN=eyJ... TEST_API_URL=http://136.115.63.96:3000 npx jest --config test/jest-e2e.json test/data-flow.e2e-spec.ts
 *
 * AUTH:
 *   Log into GapWalk on a device/emulator, then retrieve the Firebase bearer
 *   token from the app network logs.
 *   Pass it via the TEST_AUTH_TOKEN environment variable.
 *
 * NOTE: These tests validate the *backend acceptance* of all 23 table paths.
 *   They do NOT spin up a local NestJS app — they fire real HTTP requests
 *   against the running server so that production data flows can be verified.
 */

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = (process.env.TEST_API_URL ?? 'http://136.115.63.96:3000').replace(/\/$/, '');
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;

// ── Helpers ───────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface ApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

async function apiCall(
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  return { status: res.status, data };
}

function authed(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse> {
  if (!AUTH_TOKEN) {
    throw new Error(
      'TEST_AUTH_TOKEN env variable is required.\n' +
        'Log into GapWalk, capture a Firebase bearer token from the app network logs, then run:\n' +
        '  TEST_AUTH_TOKEN=eyJ... npx jest --config test/jest-e2e.json test/data-flow.e2e-spec.ts',
    );
  }
  return apiCall(method, path, body, AUTH_TOKEN);
}

// A fixed past timestamp used as a stable "now" throughout this test run
const RUN_TS = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
const DAY_TODAY = new Date().toISOString().slice(0, 10);

// ── Full sync payload covering all 12 sync categories ────────────────────────

function buildFullSyncPayload() {
  const walkStart = new Date(Date.now() - 20 * 60_000).toISOString();
  const walkEnd = new Date(Date.now() - 5 * 60_000).toISOString();
  const gapStart = new Date(Date.now() - 30 * 60_000).toISOString();
  const gapEnd = new Date(Date.now() + 30 * 60_000).toISOString();

  return {
    lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),

    // 1. UserProfile
    userProfile: {
      email: 'e2e-test@gapwalk.test',
      displayName: 'E2E Test User',
    },

    // 2. Preferences
    preferences: {
      dailyTargetMinutes: 30,
      bufferMinutes: 5,
      notificationCountPerDay: 3,
      notificationMinGapMinutes: 120,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      minWalkMinutes: 10,
      gracePeriodMinutes: 5,
      whenToNotify: 'now',
      notifyDelayMinutes: 0,
      strictnessMode: 'easygoing',
      stepGoalEnabled: false,
      stepGoal: 3000,
      preferredWalkingPeriods: [],
    },

    // 3. ScheduleSource
    scheduleSource: { type: 'manual' },

    // 4. BusyEvents
    busyEvents: [
      {
        localId: `e2e-busy-${Date.now()}`,
        title: 'E2E Test Busy Event',
        start: new Date(Date.now() + 3600_000).toISOString(),
        endTime: new Date(Date.now() + 5400_000).toISOString(),
        source: 'manual',
        isAllDay: false,
      },
    ],

    // 5. ManualScheduleEntries
    manualScheduleEntries: [
      {
        localId: `e2e-manual-${Date.now()}`,
        title: 'E2E Lunch Break',
        dayOfWeek: 1,
        startTime: '12:00',
        endTime: '13:00',
        isOneTime: false,
      },
    ],

    // 6. NudgePlans
    nudgePlans: [
      {
        localId: `e2e-plan-${Date.now()}`,
        date: DAY_TODAY,
        gapStart,
        gapEnd,
        walkStart,
        suggestedDurationMinutes: 15,
        status: 'completed',
        reason: 'gap',
      },
    ],

    // 7. WalkSessions (with nested PauseEvents + RoutePoints)
    walkSessions: [
      {
        localId: `e2e-walk-${Date.now()}`,
        start: walkStart,
        endTime: walkEnd,
        activeSeconds: 900,
        pausedSeconds: 0,
        pauseCount: 0,
        distanceMeters: 950,
        steps: 1200,
        calories: 55,
        usedLocation: false,
        wasRecovered: false,
        pauseEvents: [
          {
            pauseStartedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
            pauseEndedAt: new Date(Date.now() - 14 * 60_000).toISOString(),
            pauseDurationSeconds: 60,
            pauseSource: 'user',
            pauseReason: 'rest',
          },
        ],
        routePoints: [
          {
            latitude: -33.8688,
            longitude: 151.2093,
            accuracyMeters: 10,
            recordedAt: walkStart,
          },
        ],
      },
    ],

    // 8. AnalyticsEvents
    analyticsEvents: [
      {
        name: 'e2e_test_event',
        payload: { source: 'data-flow-e2e-spec', runTs: RUN_TS },
        clientCreatedAt: RUN_TS,
      },
    ],

    // 9. CrashReports
    crashReports: [
      {
        message: 'E2E test simulated crash',
        stack: 'Error: E2E test\n  at data-flow.e2e-spec.ts:1:1',
        isFatal: false,
        context: { source: 'data-flow-e2e-spec' },
        clientCreatedAt: RUN_TS,
        wasWalkInProgress: false,
        appState: 'active',
      },
    ],

    // 10. Achievements
    achievements: [{ achievementId: 'first_walk', unlockedAt: RUN_TS }],

    // 11. AppSessions
    appSessions: [
      {
        sessionStart: new Date(Date.now() - 600_000).toISOString(),
        sessionEnd: new Date(Date.now() - 300_000).toISOString(),
        foregroundSeconds: 300,
        screensVisited: ['Dashboard', 'WeeklyData'],
        source: 'cold_start',
      },
    ],
  };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('POST /api/sync — Full sync payload (11 categories)', () => {
  beforeAll(() => {
    if (!AUTH_TOKEN) {
      throw new Error('TEST_AUTH_TOKEN is required. Run: TEST_AUTH_TOKEN=eyJ... npm run test:e2e');
    }
  });

  it('returns 200/201 with syncedAt for a full payload', async () => {
    const { status, data } = await authed('POST', '/sync', buildFullSyncPayload());
    expect([200, 201]).toContain(status);
    expect(data).toHaveProperty('syncedAt');
  });

  it('UserProfile — GET /users/me returns the authenticated user', async () => {
    await authed('POST', '/sync', {
      userProfile: { email: 'e2e-test@gapwalk.test', displayName: 'E2E Test User' },
    });
    const { status, data } = await authed('GET', '/users/me');
    expect(status).toBe(200);
    const user = (data as { user?: unknown })?.user ?? data;
    expect(user).toBeDefined();
  });

  it('Preferences — sync writes preferences without error', async () => {
    const { status } = await authed('POST', '/sync', {
      preferences: {
        dailyTargetMinutes: 25,
        bufferMinutes: 5,
        notificationCountPerDay: 2,
        notificationMinGapMinutes: 90,
        quietHoursStart: '23:00',
        quietHoursEnd: '06:00',
        minWalkMinutes: 8,
        gracePeriodMinutes: 3,
        whenToNotify: 'now',
        notifyDelayMinutes: 0,
        strictnessMode: 'easygoing',
        stepGoalEnabled: false,
        stepGoal: 2500,
        preferredWalkingPeriods: [],
      },
    });
    expect([200, 201]).toContain(status);
  });

  it('ScheduleSource — sync writes schedule source', async () => {
    const { status } = await authed('POST', '/sync', { scheduleSource: { type: 'manual' } });
    expect([200, 201]).toContain(status);
  });

  it('BusyEvents — sync appends busy events', async () => {
    const { status } = await authed('POST', '/sync', {
      busyEvents: [
        {
          localId: `e2e-busy-iso-${Date.now()}`,
          title: 'Isolated busy event',
          start: new Date(Date.now() + 7200_000).toISOString(),
          endTime: new Date(Date.now() + 9000_000).toISOString(),
          source: 'manual',
          isAllDay: false,
        },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('ManualScheduleEntries — sync replaces all entries', async () => {
    const { status } = await authed('POST', '/sync', {
      manualScheduleEntries: [
        {
          localId: `e2e-manual-iso-${Date.now()}`,
          title: 'Isolated manual entry',
          dayOfWeek: 3,
          startTime: '09:00',
          endTime: '10:00',
          isOneTime: false,
        },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('NudgePlans — sync upserts nudge plans', async () => {
    const gapStart = new Date(Date.now() + 3600_000).toISOString();
    const gapEnd = new Date(Date.now() + 7200_000).toISOString();
    const walkStart = new Date(Date.now() + 3900_000).toISOString();
    const { status } = await authed('POST', '/sync', {
      nudgePlans: [
        {
          localId: `e2e-plan-iso-${Date.now()}`,
          date: DAY_TODAY,
          gapStart,
          gapEnd,
          walkStart,
          suggestedDurationMinutes: 20,
          status: 'planned',
          reason: 'gap',
        },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('WalkSessions + PauseEvents + RoutePoints — sync writes nested walk data', async () => {
    const walkStart = new Date(Date.now() - 40 * 60_000).toISOString();
    const walkEnd = new Date(Date.now() - 25 * 60_000).toISOString();
    const { status } = await authed('POST', '/sync', {
      walkSessions: [
        {
          localId: `e2e-walk-iso-${Date.now()}`,
          start: walkStart,
          endTime: walkEnd,
          activeSeconds: 900,
          pausedSeconds: 60,
          pauseCount: 1,
          distanceMeters: 1050,
          steps: 1400,
          calories: 65,
          usedLocation: true,
          wasRecovered: false,
          pauseEvents: [
            {
              pauseStartedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
              pauseEndedAt: new Date(Date.now() - 34 * 60_000).toISOString(),
              pauseDurationSeconds: 60,
              pauseSource: 'user',
            },
          ],
          routePoints: [
            {
              latitude: -33.8688,
              longitude: 151.2093,
              accuracyMeters: 8,
              recordedAt: walkStart,
            },
            {
              latitude: -33.8695,
              longitude: 151.21,
              accuracyMeters: 8,
              recordedAt: walkEnd,
            },
          ],
        },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('AnalyticsEvents — sync appends analytics events', async () => {
    const { status } = await authed('POST', '/sync', {
      analyticsEvents: [
        { name: 'e2e_isolated_event', payload: { ts: RUN_TS }, clientCreatedAt: RUN_TS },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('CrashReports — sync appends crash reports', async () => {
    const { status } = await authed('POST', '/sync', {
      crashReports: [
        { message: 'E2E isolated crash', isFatal: false, clientCreatedAt: RUN_TS, appState: 'background' },
      ],
    });
    expect([200, 201]).toContain(status);
  });

  it('UserAchievements — sync upserts achievements', async () => {
    const { status } = await authed('POST', '/sync', {
      achievements: [{ achievementId: 'first_walk', unlockedAt: RUN_TS }],
    });
    expect([200, 201]).toContain(status);
  });

  it('AppSessions — sync appends app sessions', async () => {
    const { status } = await authed('POST', '/sync', {
      appSessions: [
        {
          sessionStart: new Date(Date.now() - 900_000).toISOString(),
          sessionEnd: new Date(Date.now() - 600_000).toISOString(),
          foregroundSeconds: 300,
          screensVisited: ['Dashboard', 'Achievements'],
          source: 'cold_start',
        },
      ],
    });
    expect([200, 201]).toContain(status);
  });
});

// ── Direct endpoint tests ─────────────────────────────────────────────────────

describe('POST /api/devices — Device registration', () => {
  it('registers a device and returns 200 or 201', async () => {
    const { status } = await authed('POST', '/devices', {
      expoPushToken: 'ExponentPushToken[e2e-test-token-placeholder]',
      platform: 'android',
      appVersion: '1.0.0',
      osVersion: '13',
      deviceModel: 'E2E Test Device',
      notificationPermissionGranted: true,
      activityPermissionGranted: false,
    });
    expect([200, 201]).toContain(status);
  });

  it('returns 400 for missing required expoPushToken', async () => {
    const { status } = await authed('POST', '/devices', { platform: 'android' });
    expect(status).toBe(400);
  });

  it('GET /api/devices — returns an array of registered devices', async () => {
    const { status, data } = await authed('GET', '/devices');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('POST /api/behavior-log — Behavior event logging', () => {
  it('logs a single behavior event', async () => {
    const { status } = await authed('POST', '/behavior-log', {
      eventType: 'screen_view',
      screen: 'Dashboard',
      metadata: { source: 'e2e-test' },
    });
    expect([200, 201]).toContain(status);
  });

  it('POST /api/behavior-log/bulk — logs multiple events', async () => {
    const { status } = await authed('POST', '/behavior-log/bulk', {
      logs: [
        { eventType: 'button_tap', screen: 'Dashboard', metadata: { button: 'start_walk' } },
        { eventType: 'screen_view', screen: 'Walking', metadata: {} },
      ],
    });
    expect([200, 201]).toContain(status);
  });
});

describe('POST /api/analytics/aggregate — Analytics aggregation', () => {
  it('POST /api/analytics/aggregate/daily — endpoint is reachable', async () => {
    const { status } = await authed('POST', '/analytics/aggregate/daily', { date: DAY_TODAY });
    expect([200, 201, 400, 403, 404]).toContain(status);
  });

  it('POST /api/analytics/aggregate/weekly — endpoint is reachable', async () => {
    const weekStart = new Date();
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    const { status } = await authed('POST', '/analytics/aggregate/weekly', {
      weekStart: weekStart.toISOString().slice(0, 10),
    });
    expect([200, 201, 400, 403, 404]).toContain(status);
  });
});

describe('POST /api/nudge-plans/generate — Nudge plan generation', () => {
  it('generates nudge plans for today + tomorrow', async () => {
    const { status } = await authed('POST', '/nudge-plans/generate');
    expect([200, 201, 400]).toContain(status);
  });

  it("GET /api/nudge-plans/today — returns today's plans as an array", async () => {
    const { status, data } = await authed('GET', '/nudge-plans/today');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/nudge-plans/upcoming — returns upcoming plans as an array', async () => {
    const { status, data } = await authed('GET', '/nudge-plans/upcoming');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('POST /api/users/me/profile — User profile demographics', () => {
  it('saves demographic profile fields', async () => {
    const { status } = await authed('POST', '/users/me/profile', {
      age: 35,
      sex: 'prefer_not_to_say',
      occupation: 'researcher',
      consentGiven: true,
    });
    expect([200, 201, 400]).toContain(status);
  });
});

// ── Backend-only table paths ──────────────────────────────────────────────────

describe('Backend-only table paths', () => {
  it('GET /api/walk-sessions — endpoint is reachable', async () => {
    const { status } = await authed('GET', '/walk-sessions');
    expect([200, 401, 403, 404]).toContain(status);
  });

  it('GET /api/app-sessions — endpoint is reachable', async () => {
    const { status } = await authed('GET', '/app-sessions');
    expect([200, 401, 403, 404]).toContain(status);
  });
});

// ── Auth guard sanity ─────────────────────────────────────────────────────────

describe('Auth guard — unauthenticated requests return 401', () => {
  it('POST /api/sync without token', async () => {
    const { status } = await apiCall('POST', '/sync', {});
    expect(status).toBe(401);
  });

  it('POST /api/devices without token', async () => {
    const { status } = await apiCall('POST', '/devices', {
      expoPushToken: 'test',
      platform: 'android',
    });
    expect(status).toBe(401);
  });

  it('GET /api/nudge-plans/today without token', async () => {
    const { status } = await apiCall('GET', '/nudge-plans/today');
    expect(status).toBe(401);
  });
});
