import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'gapwalk_guidance_';

export const GUIDANCE_KEYS = [
  'dashboard_welcome',
  'dashboard_tour',
  'dashboard_opportunities_hint',
  'dashboard_manual_walk_hint',
  'weekly_data_hint',
  'achievements_hint',
  'schedule_editor_tour',
] as const;

export type GuidanceKey = (typeof GUIDANCE_KEYS)[number];

export const guidanceStorage = {
  async hasSeen(key: GuidanceKey): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const val = await SecureStore.getItemAsync(PREFIX + key);
      return val === '1';
    } catch {
      return false;
    }
  },

  async markSeen(key: GuidanceKey): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.setItemAsync(PREFIX + key, '1');
    } catch { /* non-critical */ }
  },

  async loadAll(): Promise<Record<GuidanceKey, boolean>> {
    const result = {} as Record<GuidanceKey, boolean>;
    for (const key of GUIDANCE_KEYS) {
      result[key] = await guidanceStorage.hasSeen(key);
    }
    return result;
  },

  async resetAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    for (const key of GUIDANCE_KEYS) {
      try {
        await SecureStore.deleteItemAsync(PREFIX + key);
      } catch { /* ignore */ }
    }
  },
};
