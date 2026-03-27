import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch, registerDevice } from './backendSync';
import { firebaseAuthService } from './firebaseAuth';
import {
  getExpoPushProjectId,
  getRemotePushRegistrationError,
  isAndroidFirebaseInitializationError,
  isNotificationsSupported,
} from './notifications';
import { getNotificationPermissionState } from './permissions';

export async function registerCurrentDeviceForNotifications(): Promise<boolean> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const updateTimezoneFallback = async (): Promise<boolean> => {
    try {
      const user = firebaseAuthService.getCurrentUser();
      if (!user) return false;
      await apiFetch('/users/me', { timezone }, 'PATCH');
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
    const projectId = getExpoPushProjectId();
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    if (!tokenData?.data) {
      return updateTimezoneFallback();
    }

    return registerDevice({
      expoPushToken: tokenData.data,
      platform: Platform.OS as 'ios' | 'android',
      appVersion: Constants.expoConfig?.version,
      osVersion: String(Platform.Version),
      deviceModel: Device.modelName ?? undefined,
      timezone,
      notificationPermissionGranted: notificationPermission.granted,
    });
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
