import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const LEGACY_AUTH_TOKEN_KEY = 'gapwalk_auth_token';
const AUTH_USER_KEY = 'gapwalk_auth_user';
const REMEMBER_ME_KEY = 'gapwalk_remember_me';
const PROFILE_DISPLAY_NAME_KEY = 'gapwalk_profile_display_name';
const SETTINGS_THEME_KEY = 'gapwalk_settings_theme';
const SETTINGS_LANGUAGE_KEY = 'gapwalk_settings_language';
const LAST_NOTIF_KEY = 'gapwalk_last_notif_response_key';
const SETTINGS_DISTANCE_UNIT_KEY = 'gapwalk_settings_distance_unit';
const SETTINGS_VIBRATION_KEY = 'gapwalk_settings_vibration';
const SETTINGS_WALK_DISPLAY_CARDS_KEY = 'gapwalk_settings_walk_display_cards';
const SETTINGS_NOTIFICATION_TIMER_MODE_KEY = 'gapwalk_settings_notification_timer_mode';
const SETTINGS_NOTIFICATION_STATS_MODE_KEY = 'gapwalk_settings_notification_stats_mode';
const LAST_SYNCED_AT_KEY = 'gapwalk_last_synced_at';
const LAST_LOGIN_AT_KEY = 'gapwalk_last_login_at';
const SETTINGS_END_WALK_MODE_KEY = 'gapwalk_settings_end_walk_mode';

export interface StoredAuthUser {
  email?: string;
  name?: string;
  uid?: string;
  providerId?: string;
  emailVerified?: boolean;
}

export const authStorage = {
  async saveUser(user: StoredAuthUser): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
  },

  async getUser(): Promise<StoredAuthUser | null> {
    if (Platform.OS === 'web') return null;
    const raw = await SecureStore.getItemAsync(AUTH_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setRememberMe(value: boolean): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(REMEMBER_ME_KEY, value ? '1' : '0');
  },

  async getRememberMe(): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    const val = await SecureStore.getItemAsync(REMEMBER_ME_KEY);
    if (val === '0') return false;
    return true;
  },

  async saveProfileDisplayName(name: string): Promise<void> {
    if (Platform.OS === 'web') return;
    const normalized = name.trim();
    if (!normalized) return;
    await SecureStore.setItemAsync(PROFILE_DISPLAY_NAME_KEY, normalized);
  },

  async getProfileDisplayName(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    const stored = await SecureStore.getItemAsync(PROFILE_DISPLAY_NAME_KEY);
    const normalized = stored?.trim();
    return normalized ? normalized : null;
  },

  async saveThemeMode(mode: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_THEME_KEY, mode);
  },

  async getThemeMode(): Promise<'dark' | 'light' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_THEME_KEY);
    if (val === 'dark' || val === 'light') return val;
    return null;
  },

  async saveLanguage(lang: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_LANGUAGE_KEY, lang);
  },

  async getLanguage(): Promise<'en' | 'es' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_LANGUAGE_KEY);
    if (val === 'en' || val === 'es') return val;
    return null;
  },

  async saveLastHandledNotificationKey(key: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.setItemAsync(LAST_NOTIF_KEY, key); } catch { /* ignore */ }
  },

  async getLastHandledNotificationKey(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try { return await SecureStore.getItemAsync(LAST_NOTIF_KEY); } catch { return null; }
  },

  async saveDistanceUnit(unit: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_DISTANCE_UNIT_KEY, unit);
  },

  async getDistanceUnit(): Promise<'km' | 'mi' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_DISTANCE_UNIT_KEY);
    if (val === 'km' || val === 'mi') return val;
    return null;
  },

  async saveVibrationEnabled(enabled: boolean): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_VIBRATION_KEY, enabled ? '1' : '0');
  },

  async getVibrationEnabled(): Promise<boolean | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_VIBRATION_KEY);
    if (val === '1') return true;
    if (val === '0') return false;
    return null;
  },

  async saveWalkDisplayCards(cards: string[]): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_WALK_DISPLAY_CARDS_KEY, JSON.stringify(cards));
  },

  async getWalkDisplayCards(): Promise<string[] | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_WALK_DISPLAY_CARDS_KEY);
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
    return null;
  },

  async saveNotificationTimerMode(mode: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_NOTIFICATION_TIMER_MODE_KEY, mode);
  },

  async getNotificationTimerMode(): Promise<'smart' | 'elapsed' | 'remaining' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_NOTIFICATION_TIMER_MODE_KEY);
    if (val === 'smart' || val === 'elapsed' || val === 'remaining') return val;
    return null;
  },

  async saveNotificationStatsMode(mode: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_NOTIFICATION_STATS_MODE_KEY, mode);
  },

  async getNotificationStatsMode(): Promise<'all' | 'steps' | 'distance' | 'none' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_NOTIFICATION_STATS_MODE_KEY);
    if (val === 'all' || val === 'steps' || val === 'distance' || val === 'none') return val;
    return null;
  },

  async saveEndWalkMode(mode: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(SETTINGS_END_WALK_MODE_KEY, mode);
  },

  async getEndWalkMode(): Promise<'quick' | 'confirm' | null> {
    if (Platform.OS === 'web') return null;
    const val = await SecureStore.getItemAsync(SETTINGS_END_WALK_MODE_KEY);
    if (val === 'quick' || val === 'confirm') return val;
    return null;
  },

  async saveLastSyncedAt(syncedAt: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.setItemAsync(LAST_SYNCED_AT_KEY, syncedAt); } catch { /* ignore */ }
  },

  async getLastSyncedAt(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try { return await SecureStore.getItemAsync(LAST_SYNCED_AT_KEY); } catch { return null; }
  },

  async clearLastSyncedAt(): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.deleteItemAsync(LAST_SYNCED_AT_KEY); } catch { /* ignore */ }
  },

  async saveLastLoginAt(isoString: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try { await SecureStore.setItemAsync(LAST_LOGIN_AT_KEY, isoString); } catch { /* ignore */ }
  },

  async getLastLoginAt(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try { return await SecureStore.getItemAsync(LAST_LOGIN_AT_KEY); } catch { return null; }
  },

  async clearAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(LEGACY_AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
    await SecureStore.deleteItemAsync(LAST_LOGIN_AT_KEY);
    await SecureStore.deleteItemAsync(LAST_SYNCED_AT_KEY);
  },
};
