import { analyticsRepo } from '../data/repositories/analyticsRepo';

export const analyticsService = {
  track(name: string, payload?: Record<string, unknown>): void {
    void analyticsRepo.saveEvent({ name, payload }).catch((error) => {
      if (__DEV__) console.error('Failed to save analytics event:', error);
    });
  },
};
