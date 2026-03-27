import { addMinutes, endOfDay, format, isAfter, parseISO, startOfDay } from 'date-fns';
import { analyticsService } from './analytics';
import { isNotificationsSupported, notificationService } from './notifications';
import { gapEngine } from './gapEngine';
import { plansRepo } from '../data/repositories/plansRepo';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { NudgePlan } from '../types';

const terminalStatuses = new Set(['cancelled', 'completed', 'skipped']);

const rescheduleFutureNudges = async () => {
  const prefs = await preferencesRepo.get();
  if (!prefs || !isNotificationsSupported) return;
  try {
    await notificationService.recoverScheduledNotifications({
      prefs,
      requestPermissions: false,
    });
  } catch (error) {
    // If scheduling failed after cancellation, retry once
    try {
      await notificationService.recoverScheduledNotifications({
        prefs,
        requestPermissions: false,
      });
    } catch {
      if (__DEV__) console.error('Failed to reschedule nudges:', error);
    }
  }
};

export const notificationPlanActions = {
  async expireStaleNotifiedPlans(): Promise<number> {
    const todayPlans = await plansRepo.getTodayPlans();
    const now = new Date();
    let expired = 0;
    let lastExpiredId: string | null = null;
    for (const plan of todayPlans) {
      if (
        (plan.status === 'notified' || plan.status === 'planned') &&
        isAfter(now, parseISO(plan.gapEnd))
      ) {
        await plansRepo.updateStatusWithReason(plan.id, 'cancelled', 'missed');
        if (isNotificationsSupported) {
          await notificationService.clearPlanNotifications(plan.id, { dismissMissed: false });
        }
        analyticsService.track('plan_expired', { planId: plan.id, previousStatus: plan.status });
        lastExpiredId = plan.id;
        expired++;
      }
    }

    if (expired > 0 && lastExpiredId) {
      void this.findAndSuggestAlternativeGap(lastExpiredId).catch((e) => { if (__DEV__) console.warn('Alt gap suggestion failed:', e); });
    }

    return expired;
  },

  async reconcileExpiredPlansAndNotifications(): Promise<number> {
    const expired = await this.expireStaleNotifiedPlans();
    if (isNotificationsSupported) {
      const todayPlans = await plansRepo.getTodayPlans();
      await notificationService.cleanupPresentedPlanNotifications(todayPlans);
    }
    return expired;
  },

  async markNotifiedIfPlanned(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    if (plan.status === 'planned') {
      await plansRepo.updateStatus(plan.id, 'notified');
      analyticsService.track('notification_delivered', { planId: plan.id });
      analyticsService.track('nudge_scheduled', { planId: plan.id });
      return true;
    }
    return false;
  },

  async skipPlan(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    await plansRepo.updateStatus(plan.id, 'skipped');
    if (isNotificationsSupported) {
      await notificationService.clearPlanNotifications(plan.id);
    }
    await rescheduleFutureNudges();
    analyticsService.track('notification_skip_action', {
      planId: plan.id,
      skippedGapStart: plan.gapStart,
      skippedGapEnd: plan.gapEnd,
    });
    analyticsService.track('nudge_swiped_away', {
      planId: plan.id,
      gapStart: plan.gapStart,
      gapEnd: plan.gapEnd,
    });

    void this.findAndSuggestAlternativeGap(planId).catch((e) => { if (__DEV__) console.warn('Alt gap suggestion failed:', e); });

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
        if (isNotificationsSupported) {
          await notificationService.clearPlanNotifications(item.id);
        }
      }
    } else {
      await plansRepo.updateStatus(plan.id, 'skipped');
      if (isNotificationsSupported) {
        await notificationService.clearPlanNotifications(plan.id);
      }
    }

    await rescheduleFutureNudges();
    analyticsService.track('notification_skip_action', {
      planId: plan.id,
      skippedGapStart: plan.gapStart,
      skippedGapEnd: plan.gapEnd,
    });
    analyticsService.track('nudge_action_skip', {
      planId: plan.id,
      gapStart: plan.gapStart,
      gapEnd: plan.gapEnd,
    });

    void this.findAndSuggestAlternativeGap(planId).catch((e) => { if (__DEV__) console.warn('Alt gap suggestion failed:', e); });

    return true;
  },

  async canStartPlan(planId: string): Promise<{ allowed: boolean; planExists: boolean }> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) {
      return { allowed: false, planExists: !!plan };
    }

    if (isAfter(new Date(), parseISO(plan.gapEnd))) {
      await plansRepo.updateStatusWithReason(plan.id, 'cancelled', 'missed');
      if (isNotificationsSupported) {
        await notificationService.clearPlanNotifications(plan.id, { dismissMissed: false });
      }
      return { allowed: false, planExists: true };
    }

    if (plan.status === 'planned') {
      await plansRepo.updateStatus(plan.id, 'notified');
    }

    const prefs = await preferencesRepo.get();
    if (prefs) {
      const minsToday = await sessionsRepo.getTodayMinutes();
      if (minsToday >= prefs.dailyTargetMinutes) {
        await plansRepo.updateStatus(plan.id, 'cancelled');
        if (isNotificationsSupported) {
          await notificationService.clearPlanNotifications(plan.id);
        }
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
          if (isNotificationsSupported) {
            await notificationService.clearPlanNotifications(plan.id);
          }
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
    analyticsService.track('nudge_tapped', { planId: plan.id });
    return { allowed: true, planExists: true };
  },

  /**
   * Find the next available gap after a skip/miss and suggest it to the user
   * via a notification with Yes/No actions.
   */
  async findAndSuggestAlternativeGap(skippedPlanId: string): Promise<boolean> {
    const prefs = await preferencesRepo.get();
    if (!prefs || !isNotificationsSupported) return false;

    // Guard: don't suggest if there's already a pending alt-gap suggestion for today
    const todayPlans = await plansRepo.getTodayPlans();
    const hasPendingAltGap = todayPlans.some(
      (p) => p.reason === 'alt_gap_suggestion' && p.status === 'planned'
    );
    if (hasPendingAltGap) return false;

    const events = await eventsRepo.getAll();
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const rawGaps = gapEngine.findGaps(dayStart, dayEnd, events, prefs);

    // Get the skipped plan to avoid suggesting the same gap
    const skippedPlan = await plansRepo.getById(skippedPlanId);

    const bufferMinutes = prefs.bufferMinutes ?? 2;
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const minWalkMinutes = prefs.minWalkMinutes ?? 6;
    const minRequired = bufferMinutes + gracePeriod + minWalkMinutes;

    const nextGap = rawGaps.find((gap) => {
      // Gap must end in the future
      if (gap.end <= now) return false;

      // Don't suggest the same gap the user just skipped
      if (
        skippedPlan &&
        gap.start.toISOString() === skippedPlan.gapStart &&
        gap.end.toISOString() === skippedPlan.gapEnd
      ) {
        return false;
      }

      // Gap must have enough remaining time
      const effectiveStart = gap.start > now ? gap.start : now;
      const remainingMinutes = (gap.end.getTime() - effectiveStart.getTime()) / 60000;
      return remainingMinutes >= minRequired;
    });

    if (!nextGap) return false;

    const effectiveGapStart = nextGap.start > now ? nextGap.start : now;
    const walkStart = addMinutes(effectiveGapStart, bufferMinutes + gracePeriod);
    const availableMinutes = Math.floor(
      (nextGap.end.getTime() - walkStart.getTime()) / 60000
    );
    const suggestedDuration = Math.max(
      minWalkMinutes,
      Math.min(availableMinutes, prefs.dailyTargetMinutes)
    );

    const altPlan: NudgePlan = {
      id: `plan-alt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      date: format(now, 'yyyy-MM-dd'),
      gapStart: nextGap.start.toISOString(),
      gapEnd: nextGap.end.toISOString(),
      walkStart: walkStart.toISOString(),
      suggestedDurationMinutes: suggestedDuration,
      status: 'planned',
      reason: 'alt_gap_suggestion',
      createdAt: new Date().toISOString(),
    };

    await plansRepo.save(altPlan);

    const notificationId = await notificationService.scheduleAlternativeGapNotification(
      altPlan.id,
      effectiveGapStart,
      nextGap.end,
      altPlan.suggestedDurationMinutes
    );

    if (!notificationId) {
      await plansRepo.updateStatusWithReason(altPlan.id, 'cancelled', 'alt_gap_notification_failed');
      return false;
    }

    analyticsService.track('alt_gap_suggested', {
      originalPlanId: skippedPlanId,
      altPlanId: altPlan.id,
      altGapStart: altPlan.gapStart,
      altGapEnd: altPlan.gapEnd,
    });

    return true;
  },

  /**
   * Accept an alternative gap suggestion — schedule a walk nudge for it.
   */
  async acceptAlternativeGap(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || plan.status !== 'planned') return false;

    const prefs = await preferencesRepo.get();
    await notificationService.schedulePlanNotifications(plan, prefs ?? undefined);

    analyticsService.track('alt_gap_accepted', {
      planId: plan.id,
      gapStart: plan.gapStart,
      gapEnd: plan.gapEnd,
    });
    return true;
  },

  /**
   * Decline an alternative gap suggestion — cancel the plan.
   */
  async declineAlternativeGap(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || plan.status !== 'planned') return false;

    await plansRepo.updateStatusWithReason(plan.id, 'cancelled', 'declined_alt_gap');
    if (isNotificationsSupported) {
      await notificationService.clearPlanNotifications(plan.id);
    }
    analyticsService.track('alt_gap_declined', {
      planId: plan.id,
      gapStart: plan.gapStart,
      gapEnd: plan.gapEnd,
    });
    return true;
  },

  /**
   * Skip a plan silently — marks it as skipped, finds a replacement gap,
   * and adds it to walking opportunities WITHOUT sending any notification
   * about the new gap. Used by "Not Now" on Phase 2 walk ready prompt.
   */
  async skipPlanSilently(planId: string): Promise<boolean> {
    const plan = await plansRepo.getById(planId);
    if (!plan || terminalStatuses.has(plan.status)) return false;

    await plansRepo.updateStatus(plan.id, 'skipped');
    if (isNotificationsSupported) {
      await notificationService.clearPlanNotifications(plan.id);
    }
    analyticsService.track('plan_skipped_silently', {
      planId: plan.id,
      gapStart: plan.gapStart,
      gapEnd: plan.gapEnd,
    });

    // Find and add replacement gap silently (no notification about it)
    void this.findAndAddAlternativeGapSilently(planId).catch((e) => {
      if (__DEV__) console.warn('Silent alt gap failed:', e);
    });

    await rescheduleFutureNudges();
    return true;
  },

  /**
   * Find the next available gap and add it as a planned walk opportunity
   * WITHOUT sending any notification about the new gap itself.
   * The new opportunity will just appear on the Dashboard silently.
   */
  async findAndAddAlternativeGapSilently(skippedPlanId: string): Promise<boolean> {
    const prefs = await preferencesRepo.get();
    if (!prefs) return false;

    const events = await eventsRepo.getAll();
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const rawGaps = gapEngine.findGaps(dayStart, dayEnd, events, prefs);

    const skippedPlan = await plansRepo.getById(skippedPlanId);

    const bufferMinutes = prefs.bufferMinutes ?? 2;
    const gracePeriod = prefs.gracePeriodMinutes ?? 2;
    const minWalkMinutes = prefs.minWalkMinutes ?? 6;
    const minRequired = bufferMinutes + gracePeriod + minWalkMinutes;

    // Also exclude gaps that already have active plans
    const todayPlans = await plansRepo.getTodayPlans();
    const activePlanGapKeys = new Set(
      todayPlans
        .filter((p) => p.status === 'planned' || p.status === 'notified')
        .map((p) => `${p.gapStart}|${p.gapEnd}`),
    );

    const nextGap = rawGaps.find((gap) => {
      if (gap.end <= now) return false;

      // Don't suggest the same gap the user just skipped
      if (
        skippedPlan &&
        gap.start.toISOString() === skippedPlan.gapStart &&
        gap.end.toISOString() === skippedPlan.gapEnd
      ) {
        return false;
      }

      // Don't suggest gaps that already have active plans
      const gapKey = `${gap.start.toISOString()}|${gap.end.toISOString()}`;
      if (activePlanGapKeys.has(gapKey)) return false;

      const effectiveStart = gap.start > now ? gap.start : now;
      const remainingMinutes = (gap.end.getTime() - effectiveStart.getTime()) / 60000;
      return remainingMinutes >= minRequired;
    });

    if (!nextGap) return false;

    const effectiveGapStart = nextGap.start > now ? nextGap.start : now;
    const walkStart = addMinutes(effectiveGapStart, bufferMinutes + gracePeriod);
    const availableMinutes = Math.floor(
      (nextGap.end.getTime() - walkStart.getTime()) / 60000
    );
    const suggestedDuration = Math.max(
      minWalkMinutes,
      Math.min(availableMinutes, prefs.dailyTargetMinutes)
    );

    const newPlan: NudgePlan = {
      id: `plan-silent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      date: format(now, 'yyyy-MM-dd'),
      gapStart: nextGap.start.toISOString(),
      gapEnd: nextGap.end.toISOString(),
      walkStart: walkStart.toISOString(),
      suggestedDurationMinutes: suggestedDuration,
      status: 'planned',
      reason: undefined, // auto-generated, not alt_gap_suggestion
      createdAt: new Date().toISOString(),
    };

    await plansRepo.save(newPlan);

    // Schedule two-phase notifications for the new plan (but NO immediate notification about it)
    if (isNotificationsSupported) {
      await notificationService.schedulePlanNotifications(newPlan, prefs);
    }

    analyticsService.track('silent_alt_gap_added', {
      originalPlanId: skippedPlanId,
      newPlanId: newPlan.id,
      gapStart: newPlan.gapStart,
      gapEnd: newPlan.gapEnd,
    });

    return true;
  },
};
