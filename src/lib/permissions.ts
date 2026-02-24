import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { isNotificationsSupported, notificationService } from './notifications';

export interface PermissionResults {
  notifications: boolean;
  activityRecognition: boolean;
}

/**
 * Request permissions needed for step counting and notifications.
 * Location is not requested for now (no map support).
 */
export async function requestAllPermissions(): Promise<PermissionResults> {
  const results: PermissionResults = {
    notifications: false,
    activityRecognition: false,
  };

  // 1. Notification permission
  try {
    if (isNotificationsSupported) {
      const granted = await notificationService.requestPermissions();
      results.notifications = granted;
    }
  } catch (e) {
    console.warn('Notification permission request failed:', e);
  }

  // 2. Activity Recognition (for pedometer / step counting)
  try {
    const available = await Pedometer.isAvailableAsync();
    if (available) {
      const { status: pedExisting } = await Pedometer.getPermissionsAsync();
      if (pedExisting === 'granted') {
        results.activityRecognition = true;
      } else {
        const { status } = await Pedometer.requestPermissionsAsync();
        results.activityRecognition = status === 'granted';
      }
    }
  } catch (e) {
    console.warn('Activity recognition permission request failed:', e);
  }

  return results;
}

/**
 * Check current permission status without requesting
 */
export async function checkPermissions(): Promise<PermissionResults> {
  const results: PermissionResults = {
    notifications: false,
    activityRecognition: false,
  };

  try {
    if (isNotificationsSupported) {
      const { status } = await Notifications.getPermissionsAsync();
      results.notifications = status === 'granted';
    }
  } catch { /* ignore */ }

  try {
    const available = await Pedometer.isAvailableAsync();
    if (available) {
      const { status } = await Pedometer.getPermissionsAsync();
      results.activityRecognition = status === 'granted';
    }
  } catch { /* ignore */ }

  return results;
}

/**
 * Show a user-friendly alert explaining why permissions are needed,
 * with an option to open device settings.
 */
export function showPermissionSettingsAlert(permissionName: string): void {
  Alert.alert(
    `${permissionName} Permission Required`,
    `GapWalk needs ${permissionName.toLowerCase()} access to work properly. Please enable it in your device settings.`,
    [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => {
          if (Platform.OS === 'android') {
            Linking.openSettings();
          } else {
            Linking.openURL('app-settings:');
          }
        },
      },
    ],
  );
}
