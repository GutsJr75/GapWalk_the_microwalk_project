import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { isNotificationsSupported, notificationService } from './notifications';

export interface PermissionResults {
  location: boolean;
  notifications: boolean;
  activityRecognition: boolean;
}

/**
 * Request all essential permissions for the app.
 * Called once after onboarding or on first Dashboard load.
 */
export async function requestAllPermissions(): Promise<PermissionResults> {
  const results: PermissionResults = {
    location: false,
    notifications: false,
    activityRecognition: false,
  };

  // 1. Location permission
  try {
    const { status: locExisting } = await Location.getForegroundPermissionsAsync();
    if (locExisting === 'granted') {
      results.location = true;
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      results.location = status === 'granted';
    }
  } catch (e) {
    console.warn('Location permission request failed:', e);
  }

  // 2. Notification permission
  try {
    if (isNotificationsSupported) {
      const granted = await notificationService.requestPermissions();
      results.notifications = granted;
    }
  } catch (e) {
    console.warn('Notification permission request failed:', e);
  }

  // 3. Activity Recognition (for pedometer / step counting)
  try {
    const available = await Pedometer.isAvailableAsync();
    if (available) {
      // Requesting pedometer access implicitly requests ACTIVITY_RECOGNITION on Android
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
    location: false,
    notifications: false,
    activityRecognition: false,
  };

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    results.location = status === 'granted';
  } catch { /* ignore */ }

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
