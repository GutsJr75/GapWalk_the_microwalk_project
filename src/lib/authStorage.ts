import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'gapwalk_auth_token';
const AUTH_USER_KEY = 'gapwalk_auth_user';
const REMEMBER_ME_KEY = 'gapwalk_remember_me';

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

  async clearAll(): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
    await SecureStore.deleteItemAsync(REMEMBER_ME_KEY);
  },
};
