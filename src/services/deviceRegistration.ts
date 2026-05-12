import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch, heartbeatDevice, registerDevice } from './backendSync';
import { useAppStore } from '../store';
import { authStorage } from '../data/authStorage';

import {
  getExpoPushProjectId,
  getRemotePushRegistrationError,
  isAndroidFirebaseInitializationError,
  isNotificationsSupported,
} from './notifications';
import { getNotificationPermissionState } from './permissions';

export async function getCurrentDeviceTimezone(): Promise<string> {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function getCurrentExpoPushToken(): Promise<string | null> {
  if (!isNotificationsSupported) return null;

  const remotePushRegistrationError = getRemotePushRegistrationError();
  if (remotePushRegistrationError) {
    if (__DEV__) console.info(remotePushRegistrationError);
    return null;
  }

  const projectId = getExpoPushProjectId();
  const tokenData = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return tokenData?.data?.trim() ? tokenData.data : null;
}

export async function registerCurrentDeviceForNotifications(): Promise<boolean> {
  if (!useAppStore.getState().isAuthenticated) {
    return false;
  }

  const timezone = await getCurrentDeviceTimezone();

  const updateTimezoneFallback = async (): Promise<boolean> => {
    try {
      await apiFetch('/users/me', { timezone }, 'PATCH');
      await authStorage.saveDeviceTimezone(timezone);
      return true;
    } catch (error) {
      if (__DEV__) console.warn('Failed to update timezone fallback:', error);
      return false;
    }
  };

  if (!isNotificationsSupported) {
    return updateTimezoneFallback();
  }

  const remotePushRegistrationError = getRemotePushRegistrationError();
  if (remotePushRegistrationError) {
    if (__DEV__) console.info(remotePushRegistrationError);
    return updateTimezoneFallback();
  }

  try {
    const notificationPermission = await getNotificationPermissionState();
    const expoPushToken = await getCurrentExpoPushToken();

    if (!expoPushToken) {
      return updateTimezoneFallback();
    }

    const registered = await registerDevice({
      expoPushToken,
      platform: 'android',
      appVersion: Constants.expoConfig?.version,
      osVersion: String(Platform.Version),
      deviceModel: Device.modelName ?? undefined,
      timezone,
      notificationPermissionGranted: notificationPermission.granted,
    });
    if (registered) {
      await authStorage.saveDeviceTimezone(timezone);
    }
    return registered;
  } catch (error) {
    if (__DEV__) {
      if (isAndroidFirebaseInitializationError(error)) {
        console.info(
          'Skipping backend device registration because Android Firebase push is not configured. Add google-services.json and rebuild if you need server push notifications.',
        );
      } else {
        console.warn('Failed to obtain push token for device registration:', error);
      }
    }

    return updateTimezoneFallback();
  }
}

export async function heartbeatCurrentDevice(): Promise<boolean> {
  if (!useAppStore.getState().isAuthenticated) {
    return false;
  }

  const timezone = await getCurrentDeviceTimezone();

  if (!isNotificationsSupported) {
    try {
      await apiFetch('/users/me', { timezone }, 'PATCH');
      await authStorage.saveDeviceTimezone(timezone);
      return true;
    } catch (error) {
      if (__DEV__) console.warn('Failed to update timezone during heartbeat fallback:', error);
      return false;
    }
  }

  try {
    const expoPushToken = await getCurrentExpoPushToken();
    if (!expoPushToken) {
      return registerCurrentDeviceForNotifications();
    }

    const ok = await heartbeatDevice({
      expoPushToken,
      timezone,
    });
    if (ok) {
      await authStorage.saveDeviceTimezone(timezone);
    }
    return ok;
  } catch (error) {
    if (__DEV__) console.warn('Failed to heartbeat current device:', error);
    return false;
  }
}
