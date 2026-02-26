import { analyticsService } from './analytics';
import { analyticsRepo } from './repositories/analyticsRepo';

let installed = false;
type CrashContext = Record<string, unknown>;
type CrashTrackEvent = 'app_crash' | 'unhandled_rejection' | 'render_crash';

const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown error');
};

const reportCrash = ({
  error,
  isFatal,
  context,
  trackEvent,
}: {
  error: unknown;
  isFatal: boolean;
  context?: CrashContext;
  trackEvent: CrashTrackEvent;
}): Error => {
  const normalized = toError(error);
  const hasContext = !!context && Object.keys(context).length > 0;
  void analyticsRepo.saveCrash({
    message: normalized.message,
    stack: normalized.stack,
    isFatal,
    ...(hasContext ? { context } : {}),
  }).catch((saveError) => {
    if (__DEV__) console.error('Failed to persist crash report:', saveError);
  });

  analyticsService.track(trackEvent, {
    isFatal,
    message: normalized.message,
    ...(hasContext ? context : {}),
  });

  return normalized;
};

export const crashReporting = {
  logError(error: unknown, context?: CrashContext): void {
    reportCrash({
      error,
      isFatal: false,
      context: { ...(context ?? {}), kind: 'error_boundary' },
      trackEvent: 'render_crash',
    });
  },

  install(): void {
    if (installed) return;
    installed = true;

    const errorUtils = (globalThis as any).ErrorUtils;
    if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
      const previous = typeof errorUtils.getGlobalHandler === 'function'
        ? errorUtils.getGlobalHandler()
        : null;

      errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        const normalized = reportCrash({
          error,
          isFatal: !!isFatal,
          trackEvent: 'app_crash',
        });

        if (typeof previous === 'function') {
          previous(normalized, !!isFatal);
        }
      });
    }

    if (typeof (globalThis as any).addEventListener === 'function') {
      (globalThis as any).addEventListener('unhandledrejection', (event: any) => {
        reportCrash({
          error: event?.reason,
          isFatal: false,
          context: { kind: 'unhandledrejection' },
          trackEvent: 'unhandled_rejection',
        });
      });
    }
  },
};
