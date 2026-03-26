import { notificationPlanActions } from './notificationPlanActions';
import { androidWalkTracking } from './androidWalkTracking';
import { analyticsService } from './analytics';
import { authStorage } from '../data/authStorage';
import { plansRepo } from '../data/repositories/plansRepo';
import { preferencesRepo } from '../data/repositories/preferencesRepo';

/**
 * Headless JS task that handles Yes / Not Now button taps on
 * walk_ready exact-alarm notifications without foregrounding the app.
 *
 * Registered in index.js as "ExactNotificationActionTask".
 */

interface TaskData {
  notificationId: string;
  planId: string;
  type: string;
  actionIdentifier: string;
}

const WALK_READY_ACTION_YES = 'YES_WALK_READY';
const WALK_READY_ACTION_NOT_NOW = 'NOT_NOW_WALK_READY';

export default async function exactNotificationActionTask(data: TaskData): Promise<void> {
  const { planId, actionIdentifier } = data;
  if (!planId) return;

  try {
    if (actionIdentifier === WALK_READY_ACTION_YES) {
      await handleYes(planId);
    } else if (actionIdentifier === WALK_READY_ACTION_NOT_NOW) {
      await handleNotNow(planId);
    }
  } catch (error) {
    if (__DEV__) console.error('exactNotificationActionTask error:', error);
  }
}

async function handleYes(planId: string): Promise<void> {
  const startCheck = await notificationPlanActions.canStartPlan(planId);
  if (!startCheck.allowed) return;

  const plan = await plansRepo.getById(planId);
  const prefs = await preferencesRepo.get();

  const notificationTimerMode = (await authStorage.getNotificationTimerMode()) ?? 'smart';
  const notificationStatsMode = (await authStorage.getNotificationStatsMode()) ?? 'all';
  const distanceUnit = (await authStorage.getDistanceUnit()) ?? 'mi';

  await androidWalkTracking.startSession({
    planId,
    targetDurationMinutes: plan?.suggestedDurationMinutes ?? null,
    startedFromNotification: true,
    notificationTimerMode,
    notificationStatsMode,
    distanceUnit,
  });

  analyticsService.track('walk_ready_yes', { planId, source: 'exact_alarm_headless' });
}

async function handleNotNow(planId: string): Promise<void> {
  await notificationPlanActions.skipPlanSilently(planId);
  analyticsService.track('walk_ready_not_now', { planId, source: 'exact_alarm_headless' });
}
