import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'gapwalk_auth_token';
const AUTH_USER_KEY = 'gapwalk_auth_user';
const REMEMBER_ME_KEY = 'gapwalk_remember_me';
const PROFILE_DISPLAY_NAME_KEY = 'gapwalk_profile_display_name';
const SETTINGS_THEME_KEY = 'gapwalk_settings_theme';
const SETTINGS_LANGUAGE_KEY = 'gapwalk_settings_language';
const LAST_NOTIF_KEY = 'gapwalk_last_notif_response_key';
const LAST_SYNC_AT_KEY = 'gapwalk_last_sync_at';

export interface StoredAuthUser {
  email?: string;
  name?: string;
  sub?: string;
}

export const authStorage = {
  async saveToken(token: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  },

  async getToken(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  },

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
    if (Platform.OS === 'web') return false;
    const val = await SecureStore.getItemAsync(REMEMBER_ME_KEY);
    return val === '1';
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

  async saveLastSyncedAt(isoTimestamp: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(LAST_SYNC_AT_KEY, isoTimestamp);
  },

  async getLastSyncedAt(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    return SecureStore.getItemAsync(LAST_SYNC_AT_KEY);
  },

  async clearAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
    await SecureStore.deleteItemAsync(REMEMBER_ME_KEY);
  },
};
