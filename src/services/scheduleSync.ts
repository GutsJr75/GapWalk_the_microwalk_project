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
    const active = existing.filter((plan) => plan.status === 'planned' || plan.status === 'notified');
    for (const plan of active) {
      await plansRepo.updateStatus(plan.id, 'cancelled');
    }

    const plans = await gapEngine.generatePlansForDate(date, events, prefs);
    await plansRepo.saveMany(plans);
    rebuiltPlans.push(...plans);
  }

  if (isNotificationsSupported) {
    await notificationService.cancelWalkNudges();
    if (rebuiltPlans.length > 0) {
      await notificationService.scheduleMultipleNudges(rebuiltPlans, prefs);
    }
  }

  return rebuiltPlans;
}
