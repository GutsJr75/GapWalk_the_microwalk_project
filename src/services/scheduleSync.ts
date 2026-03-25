import { addDays, format } from 'date-fns';
import { gapEngine } from './gapEngine';
import { isNotificationsSupported, notificationService } from './notifications';
import { eventsRepo } from '../data/repositories/eventsRepo';
import { plansRepo } from '../data/repositories/plansRepo';
import { preferencesRepo } from '../data/repositories/preferencesRepo';
import { NudgePlan, Preferences } from '../types';

/**
 * Rebuild walk opportunities after schedule/preference changes.
 * - Cancels active plans for today/tomorrow
 * - Generates fresh plans from current events
 * - Reschedules notifications
 */
export async function syncNudgePlansForCurrentSchedule(
  preferences?: Preferences | null
): Promise<NudgePlan[]> {
  const prefs = preferences ?? (await preferencesRepo.get());
  if (!prefs) return [];

  const events = await eventsRepo.getAll();
  const rebuiltPlans: NudgePlan[] = [];

  for (let i = 0; i < 2; i++) {
    const date = addDays(new Date(), i);
    const dateKey = format(date, 'yyyy-MM-dd');
    const existing = await plansRepo.getByDate(dateKey);
    const activeAutoPlans = existing.filter(
      (plan) =>
        (plan.status === 'planned' || plan.status === 'notified') &&
        plan.reason !== 'manual',
    );
    for (const plan of activeAutoPlans) {
      await plansRepo.updateStatus(plan.id, 'cancelled');
      if (isNotificationsSupported) {
        await notificationService.clearPlanNotifications(plan.id);
      }
    }

    const plans = await gapEngine.generatePlansForDate(date, events, prefs);
    await plansRepo.saveMany(plans);
    rebuiltPlans.push(...plans);
  }

  if (isNotificationsSupported) {
    try {
      await notificationService.cancelWalkNudges();
      const futurePlans = await plansRepo.getUpcomingPlans(100);
      if (futurePlans.length > 0) {
        await notificationService.scheduleMultipleNudges(futurePlans, prefs);
      }
    } catch (error) {
      // If scheduling failed after cancellation, retry once
      try {
        const futurePlans = await plansRepo.getUpcomingPlans(100);
        if (futurePlans.length > 0) {
          await notificationService.scheduleMultipleNudges(futurePlans, prefs);
        }
      } catch {
        if (__DEV__) console.error('Failed to reschedule nudges after sync:', error);
      }
    }
  }

  return rebuiltPlans;
}
