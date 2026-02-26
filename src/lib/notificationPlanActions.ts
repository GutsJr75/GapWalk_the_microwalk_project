import { isAfter, parseISO } from 'date-fns';
import { analyticsService } from './analytics';
import { isNotificationsSupported, notificationService } from './notifications';
import { plansRepo } from './repositories/plansRepo';
import { preferencesRepo } from './repositories/preferencesRepo';
import { sessionsRepo } from './repositories/sessionsRepo';

const terminalStatuses = new Set(['cancelled', 'completed', 'skipped']);

const rescheduleFutureNudges = async () => {
  const prefs = await preferencesRepo.get();
  if (!prefs || !isNotificationsSupported) return;
  await notificationService.cancelWalkNudges();
  const futurePlans = await plansRepo.getUpcomingPlans(100);
  await notificationService.scheduleMultipleNudges(futurePlans, prefs);
};

export const notificationPlanActions = {
  async expireStaleNotifiedPlans(): Promise<number> {
    const todayPlans = await plansRepo.getTodayPlans();
    const now = new Date();
    let expired = 0;
    for (const plan of todayPlans) {
      if (
        (plan.status === 'notified' || plan.status === 'planned') &&
        isAfter(now, parseISO(plan.gapEnd))
      ) {
        await plansRepo.updateStatusWithReason(plan.id, 'cancelled', 'missed');
        analyticsService.track('plan_expired', { planId: plan.id, previousStatus: plan.status });
        expired++;
      }
    }
    return expired;
  },

  async markNotifiedIfPlanned(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    if (plan.status === 'planned') {
      await plansRepo.updateStatus(plan.id, 'notified');
      analyticsService.track('notification_delivered', { planId: plan.id });
      return true;
    }
    return false;
  },

  async skipPlan(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    await plansRepo.updateStatus(plan.id, 'skipped');
    await rescheduleFutureNudges();
    analyticsService.track('notification_skip_action', {
      planId: plan.id,
      skippedGapStart: plan.gapStart,
      skippedGapEnd: plan.gapEnd,
    });
    return true;
  },

  async skipGap(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    const now = new Date();
    const todayPlans = await plansRepo.getTodayPlans();
    const sameGapActivePlans = todayPlans.filter(
      (item) =>
        (item.status === 'planned' || item.status === 'notified') &&
        item.gapStart === plan.gapStart &&
        item.gapEnd === plan.gapEnd &&
        isAfter(parseISO(item.walkStart), now)
    );

    if (sameGapActivePlans.length > 0) {
      for (const item of sameGapActivePlans) {
        await plansRepo.updateStatus(item.id, item.id === plan.id ? 'skipped' : 'cancelled');
      }
    } else {
      await plansRepo.updateStatus(plan.id, 'skipped');
    }

    await rescheduleFutureNudges();
    analyticsService.track('notification_skip_action', {
      planId: plan.id,
      skippedGapStart: plan.gapStart,
      skippedGapEnd: plan.gapEnd,
    });
    return true;
  },

  async canStartPlan(planId: string): Promise<{ allowed: boolean; planExists: boolean }> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) {
      return { allowed: false, planExists: !!plan };
    }

    if (plan.status === 'planned') {
      await plansRepo.updateStatus(plan.id, 'notified');
    }

    const prefs = await preferencesRepo.get();
    if (prefs) {
      const minsToday = await sessionsRepo.getTodayMinutes();
      if (minsToday >= prefs.dailyTargetMinutes) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
        analyticsService.track('notification_open_blocked_goal_reached', {
          planId: plan.id,
          minutesWalked: minsToday,
          dailyTargetMinutes: prefs.dailyTargetMinutes,
        });
        return { allowed: false, planExists: true };
      }

      // Also check step goal if enabled
      if (prefs.stepGoalEnabled && prefs.stepGoal > 0) {
        const stepsToday = await sessionsRepo.getTodaySteps();
        if (stepsToday >= prefs.stepGoal) {
          await plansRepo.updateStatus(plan.id, 'cancelled');
          analyticsService.track('notification_open_blocked_step_goal_reached', {
            planId: plan.id,
            stepsToday,
            stepGoal: prefs.stepGoal,
          });
          return { allowed: false, planExists: true };
        }
      }
    }

    analyticsService.track('notification_opened', { planId: plan.id });
    return { allowed: true, planExists: true };
  },
};
