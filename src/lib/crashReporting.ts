import { analyticsService } from './analytics';
import { analyticsRepo } from './repositories/analyticsRepo';

let installed = false;

const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown error');
};

export const crashReporting = {
  install(): void {
    if (installed) return;
    installed = true;

    const errorUtils = (globalThis as any).ErrorUtils;
    if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
      const previous = typeof errorUtils.getGlobalHandler === 'function'
        ? errorUtils.getGlobalHandler()
        : null;

      errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        const normalized = toError(error);
        void analyticsRepo.saveCrash({
          message: normalized.message,
          stack: normalized.stack,
          isFatal: !!isFatal,
        }).catch((saveError) => {
          console.error('Failed to persist crash report:', saveError);
        });
        analyticsService.track('app_crash', {
          isFatal: !!isFatal,
          message: normalized.message,
        });

        if (typeof previous === 'function') {
          previous(normalized, !!isFatal);
        }
      });
    }

    if (typeof (globalThis as any).addEventListener === 'function') {
      (globalThis as any).addEventListener('unhandledrejection', (event: any) => {
        const normalized = toError(event?.reason);
        void analyticsRepo.saveCrash({
          message: normalized.message,
          stack: normalized.stack,
          isFatal: false,
          context: { kind: 'unhandledrejection' },
        }).catch((saveError) => {
          console.error('Failed to persist rejected promise:', saveError);
        });
        analyticsService.track('unhandled_rejection', {
          message: normalized.message,
        });
      });
    }
  },
};
