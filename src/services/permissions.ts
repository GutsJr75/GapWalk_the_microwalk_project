import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { isNotificationsSupported, notificationService } from './notifications';

export interface PermissionResults {
  notifications: boolean;
  activityRecognition: boolean;
}

export interface WalkTrackingPermissionResults extends PermissionResults {
  locationForeground: boolean;
  locationBackground: boolean;
}

/**
 * Request permissions needed for step counting and notifications.
 * On Android, activity recognition is requested directly because the active
 * walk service reads the native step sensor via SensorManager.
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
    if (__DEV__) console.warn('Notification permission request failed:', e);
  }

  // 2. Activity Recognition (for pedometer / step counting)
  try {
    if (Platform.OS === 'android') {
      results.activityRecognition = await requestAndroidActivityRecognitionPermission();
    } else {
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
    }
  } catch (e) {
    if (__DEV__) console.warn('Activity recognition permission request failed:', e);
  }

  return results;
}

async function confirmBackgroundLocationRationale(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Allow background location?',
      'GapWalk uses background location during an active walk so distance keeps updating even when the app is not visible.',
      [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
    );
  });
}

export async function requestWalkTrackingPermissions(): Promise<WalkTrackingPermissionResults> {
  const baseResults = await requestAllPermissions();
  const results: WalkTrackingPermissionResults = {
    ...baseResults,
    locationForeground: false,
    locationBackground: false,
  };

  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    let foregroundGranted = foreground.status === 'granted';

    if (!foregroundGranted) {
      const response = await Location.requestForegroundPermissionsAsync();
      foregroundGranted = response.status === 'granted';
    }

    results.locationForeground = foregroundGranted;
    if (!foregroundGranted) return results;

    if (Platform.OS === 'android') {
      const background = await Location.getBackgroundPermissionsAsync();
      let backgroundGranted = background.status === 'granted';

      if (!backgroundGranted && await confirmBackgroundLocationRationale()) {
        const response = await Location.requestBackgroundPermissionsAsync();
        backgroundGranted = response.status === 'granted';
      }

      results.locationBackground = backgroundGranted;
    } else {
      results.locationBackground = foregroundGranted;
    }
  } catch (e) {
    if (__DEV__) console.warn('Walk tracking permission request failed:', e);
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
    if (Platform.OS === 'android') {
      results.activityRecognition = await checkAndroidActivityRecognitionPermission();
    } else {
      const available = await Pedometer.isAvailableAsync();
      if (available) {
        const { status } = await Pedometer.getPermissionsAsync();
        results.activityRecognition = status === 'granted';
      }
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

async function requestAndroidActivityRecognitionPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;

  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) return true;

  const status = await PermissionsAndroid.request(permission, {
    title: 'Allow step sensor access?',
    message: 'GapWalk uses your device step sensor during an active walk so step tracking can stay accurate.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });

  return status === PermissionsAndroid.RESULTS.GRANTED;
}

async function checkAndroidActivityRecognitionPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
}
