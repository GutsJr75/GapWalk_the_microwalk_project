import { isValid, parseISO } from 'date-fns';

export interface ExactAlarmBannerVisibilityInput {
  isAndroid: boolean;
  moduleSupported: boolean;
  canScheduleExactAlarms: boolean;
  never: boolean;
  snoozeUntilIso: string | null;
  now: Date;
}

export function shouldShowExactAlarmBanner(input: ExactAlarmBannerVisibilityInput): boolean {
  if (!input.isAndroid || !input.moduleSupported) return false;
  if (input.canScheduleExactAlarms) return false;
  if (input.never) return false;
  if (!input.snoozeUntilIso) return true;

  const until = parseISO(input.snoozeUntilIso);
  if (!isValid(until)) return true;
  return input.now.getTime() > until.getTime();
}
