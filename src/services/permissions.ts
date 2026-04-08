import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Pedometer } from 'expo-sensors';
import { isNotificationsSupported, notificationService } from './notifications';

export interface PermissionResults {
  notifications: boolean;
  activityRecognition: boolean;
}

export interface NotificationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
}

export type ActivityRecognitionPermissionStatus =
  | 'granted'
  | 'denied'
  | 'never_ask_again'
  | 'undetermined'
  | 'unavailable';

export interface ActivityRecognitionPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: ActivityRecognitionPermissionStatus;
}

export interface WalkTrackingPermissionResults extends PermissionResults {
  locationForeground: boolean;
  locationBackground: boolean;
}

export interface ForegroundLocationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
}

export interface WalkTrackingPermissionRequestOptions {
  requestBackgroundLocation?: boolean;
  showBackgroundDeniedSettingsAlert?: boolean;
  confirmBackgroundLocationDisclosure?: () => Promise<boolean>;
  requestMode?: 'default' | 'walk_start_first_time' | 'walk_start_recurring';
}

const WALK_FOREGROUND_LOCATION_REQUESTED_KEY = 'gapwalk_walk_foreground_location_requested_v1';
const ACTIVITY_RECOGNITION_REQUESTED_KEY = 'gapwalk_activity_recognition_requested_v1';

/**
 * Request permissions needed for step counting and notifications.
 * On Android, activity recognition is requested directly because the active
 * walk service reads the native step sensor via SensorManager.
 */
export async function requestAllPermissions(): Promise<PermissionResults> {
  const notificationState = await requestNotificationPermission();
  const activityRecognitionState = await requestActivityRecognitionPermissionState();
  return {
    notifications: notificationState.granted,
    activityRecognition: activityRecognitionState.granted,
  };
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (!isNotificationsSupported) {
    return {
      granted: false,
      canAskAgain: false,
      status: Notifications.PermissionStatus.UNDETERMINED,
    };
  }

  try {
    const response = await Notifications.getPermissionsAsync();
    return {
      granted: response.status === Notifications.PermissionStatus.GRANTED,
      canAskAgain: response.canAskAgain ?? response.status !== Notifications.PermissionStatus.DENIED,
      status: response.status,
    };
  } catch (e) {
    if (__DEV__) console.warn('Failed to read notification permission state:', e);
    return {
      granted: false,
      canAskAgain: false,
      status: Notifications.PermissionStatus.DENIED,
    };
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = await getNotificationPermissionState();
  if (current.granted) {
    try {
      await notificationService.requestPermissions();
    } catch (e) {
      if (__DEV__) console.warn('Notification permission refresh failed:', e);
    }
    return getNotificationPermissionState();
  }

  if (!current.canAskAgain) {
    return current;
  }

  try {
    await notificationService.requestPermissions();
  } catch (e) {
    if (__DEV__) console.warn('Notification permission request failed:', e);
  }

  return getNotificationPermissionState();
}

export async function getActivityRecognitionPermissionState(): Promise<ActivityRecognitionPermissionState> {
  try {
    if (Platform.OS === 'android') {
      return getAndroidActivityRecognitionPermissionState();
    }

    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return {
        granted: false,
        canAskAgain: false,
        status: 'unavailable',
      };
    }

    const existing = await Pedometer.getPermissionsAsync();
    return {
      granted: existing.status === 'granted',
      canAskAgain: existing.canAskAgain ?? existing.status !== 'denied',
      status: existing.status === 'granted'
        ? 'granted'
        : existing.status === 'denied'
          ? 'denied'
          : 'undetermined',
    };
  } catch (e) {
    if (__DEV__) console.warn('Activity recognition permission state read failed:', e);
    return {
      granted: false,
      canAskAgain: false,
      status: 'denied',
    };
  }
}

export async function requestActivityRecognitionPermissionState(): Promise<ActivityRecognitionPermissionState> {
  try {
    if (Platform.OS === 'android') {
      return requestAndroidActivityRecognitionPermissionState();
    }

    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return {
        granted: false,
        canAskAgain: false,
        status: 'unavailable',
      };
    }

    const current = await getActivityRecognitionPermissionState();
    if (current.granted || !current.canAskAgain) {
      return current;
    }

    await Pedometer.requestPermissionsAsync();
    return getActivityRecognitionPermissionState();
  } catch (e) {
    if (__DEV__) console.warn('Activity recognition permission request failed:', e);
    return {
      granted: false,
      canAskAgain: false,
      status: 'denied',
    };
  }
}

export async function requestActivityRecognitionPermission(): Promise<boolean> {
  const state = await requestActivityRecognitionPermissionState();
  return state.granted;
}

async function confirmBackgroundLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Allow background location for active walks?',
      'GapWalk collects location data to track distance during an active walk, including when the app is closed or not in use. Walk route and distance may sync securely to your GapWalk account. GapWalk does not sell your personal data.',
      [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
    );
  });
}

const toForegroundLocationPermissionState = (
  response: Location.PermissionResponse,
): ForegroundLocationPermissionState => ({
  granted: response.status === 'granted',
  canAskAgain: response.canAskAgain,
  status: response.status,
});

const hasRequestedWalkForegroundLocationBefore = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    return (await SecureStore.getItemAsync(WALK_FOREGROUND_LOCATION_REQUESTED_KEY)) === '1';
  } catch {
    return false;
  }
};

const markWalkForegroundLocationRequested = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(WALK_FOREGROUND_LOCATION_REQUESTED_KEY, '1');
  } catch {
    // Non-critical. The OS permission state is still authoritative.
  }
};

export async function getForegroundLocationPermissionState(): Promise<ForegroundLocationPermissionState> {
  const response = await Location.getForegroundPermissionsAsync();
  return toForegroundLocationPermissionState(response);
}

export async function requestForegroundWalkTrackingPermission(
  options: {
    showDeniedSettingsAlert?: boolean;
    forcePromptIfCanAskAgain?: boolean;
  } = {},
): Promise<ForegroundLocationPermissionState> {
  try {
    const current = await getForegroundLocationPermissionState();
    if (current.granted) return current;

    if (options.forcePromptIfCanAskAgain) {
      if (!current.canAskAgain) {
        if (options.showDeniedSettingsAlert) {
          showPermissionSettingsAlert('Location');
        }
        return current;
      }

      const response = await Location.requestForegroundPermissionsAsync();
      const nextState = toForegroundLocationPermissionState(response);
      if (!nextState.granted && !nextState.canAskAgain && options.showDeniedSettingsAlert) {
        showPermissionSettingsAlert('Location');
      }
      return nextState;
    }

    const hasRequestedBefore = await hasRequestedWalkForegroundLocationBefore();
    const systemPromptWasAlreadyShown = current.status !== Location.PermissionStatus.UNDETERMINED;
    if ((hasRequestedBefore || systemPromptWasAlreadyShown) && options.showDeniedSettingsAlert) {
      showPermissionSettingsAlert('Location');
    }
    if (hasRequestedBefore || systemPromptWasAlreadyShown) {
      return current;
    }

    if (!current.canAskAgain) {
      await markWalkForegroundLocationRequested();
      if (options.showDeniedSettingsAlert) {
        showPermissionSettingsAlert('Location');
      }
      return current;
    }

    await markWalkForegroundLocationRequested();
    const response = await Location.requestForegroundPermissionsAsync();
    const nextState = toForegroundLocationPermissionState(response);

    if (!nextState.granted && !nextState.canAskAgain && options.showDeniedSettingsAlert) {
      showPermissionSettingsAlert('Location');
    }

    return nextState;
  } catch (e) {
    if (__DEV__) console.warn('Foreground walk tracking permission request failed:', e);
    if (options.showDeniedSettingsAlert) {
      showPermissionSettingsAlert('Location');
    }
    return {
      granted: false,
      canAskAgain: false,
      status: Location.PermissionStatus.DENIED,
    };
  }
}

export async function getWalkTrackingPermissionStatus(): Promise<WalkTrackingPermissionResults> {
  const baseResults = await checkPermissions();
  const foreground = await getForegroundLocationPermissionState();
  const locationForeground = foreground.granted;
  const locationBackground = Platform.OS === 'android'
    ? (await Location.getBackgroundPermissionsAsync()).status === 'granted'
    : locationForeground;

  return {
    ...baseResults,
    locationForeground,
    locationBackground,
  };
}

export async function requestBackgroundWalkTrackingPermission(
  options: {
    showDeniedSettingsAlert?: boolean;
    confirmDisclosure?: () => Promise<boolean>;
  } = {},
): Promise<boolean> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      if (options.showDeniedSettingsAlert) {
        showPermissionSettingsAlert('Background Location');
      }
      return false;
    }

    if (Platform.OS !== 'android') {
      return true;
    }

    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status === 'granted') {
      return true;
    }

    const shouldRequest = await (
      options.confirmDisclosure
        ? options.confirmDisclosure()
        : confirmBackgroundLocationDisclosure()
    );
    if (!shouldRequest) {
      return false;
    }

    const response = await Location.requestBackgroundPermissionsAsync();
    if (response.status === 'granted') {
      return true;
    }

    const refreshed = await Location.getBackgroundPermissionsAsync();
    const granted = refreshed.status === 'granted';
    if (!granted && options.showDeniedSettingsAlert) {
      showPermissionSettingsAlert('Background Location');
    }
    return granted;
  } catch (e) {
    if (__DEV__) console.warn('Background walk tracking permission request failed:', e);
    if (options.showDeniedSettingsAlert) {
      showPermissionSettingsAlert('Background Location');
    }
    return false;
  }
}

export async function requestWalkTrackingPermissions(
  options: WalkTrackingPermissionRequestOptions = {},
): Promise<WalkTrackingPermissionResults> {
  const notificationState = await getNotificationPermissionState();
  const activityRecognitionState = await requestActivityRecognitionPermissionState();
  const results: WalkTrackingPermissionResults = {
    notifications: notificationState.granted,
    activityRecognition: activityRecognitionState.granted,
    locationForeground: false,
    locationBackground: false,
  };

  try {
    const requestMode = options.requestMode ?? 'default';
    const shouldForceForegroundPrompt = requestMode === 'walk_start_first_time' || requestMode === 'walk_start_recurring';
    const shouldRequestBackground = options.requestBackgroundLocation === true;

    const foreground = await requestForegroundWalkTrackingPermission({
      forcePromptIfCanAskAgain: shouldForceForegroundPrompt,
    });
    results.locationForeground = foreground.granted;
    if (!foreground.granted) {
      const status = await getWalkTrackingPermissionStatus();
      results.locationBackground = status.locationBackground;
      return results;
    }

    if (shouldRequestBackground) {
      results.locationBackground = await requestBackgroundWalkTrackingPermission({
        showDeniedSettingsAlert: options.showBackgroundDeniedSettingsAlert,
        confirmDisclosure: options.confirmBackgroundLocationDisclosure,
      });
      return results;
    }

    const status = await getWalkTrackingPermissionStatus();
    results.locationBackground = status.locationBackground;
  } catch (e) {
    if (__DEV__) console.warn('Walk tracking permission request failed:', e);
  }

  return results;
}

/**
 * Check current permission status without requesting
 */
export async function checkPermissions(): Promise<PermissionResults> {
  const notificationState = await getNotificationPermissionState();
  const activityRecognition = (await getActivityRecognitionPermissionState()).granted;
  return {
    notifications: notificationState.granted,
    activityRecognition,
  };
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
          void openAppSettings();
        },
      },
    ],
  );
}

export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    await Linking.openSettings();
    return;
  }

  await Linking.openURL('app-settings:');
}

const hasRequestedActivityRecognitionBefore = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  try {
    return (await SecureStore.getItemAsync(ACTIVITY_RECOGNITION_REQUESTED_KEY)) === '1';
  } catch {
    return false;
  }
};

const markActivityRecognitionRequested = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    await SecureStore.setItemAsync(ACTIVITY_RECOGNITION_REQUESTED_KEY, '1');
  } catch {
    // Non-critical. The OS permission state is still authoritative.
  }
};

async function getAndroidActivityRecognitionPermissionState(): Promise<ActivityRecognitionPermissionState> {
  if (Platform.OS !== 'android') {
    return {
      granted: false,
      canAskAgain: false,
      status: 'unavailable',
    };
  }

  if (typeof Platform.Version === 'number' && Platform.Version < 29) {
    return {
      granted: true,
      canAskAgain: true,
      status: 'granted',
    };
  }

  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  const granted = await PermissionsAndroid.check(permission);
  if (granted) {
    return {
      granted: true,
      canAskAgain: true,
      status: 'granted',
    };
  }

  const hasRequestedBefore = await hasRequestedActivityRecognitionBefore();
  if (!hasRequestedBefore) {
    return {
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    };
  }

  const shouldShowRationale =
    typeof (PermissionsAndroid as any).shouldShowRequestPermissionRationale === 'function'
      ? await (PermissionsAndroid as any).shouldShowRequestPermissionRationale(permission)
      : true;
  return {
    granted: false,
    canAskAgain: shouldShowRationale,
    status: shouldShowRationale ? 'denied' : 'never_ask_again',
  };
}

async function requestAndroidActivityRecognitionPermissionState(): Promise<ActivityRecognitionPermissionState> {
  const current = await getAndroidActivityRecognitionPermissionState();
  if (current.granted || !current.canAskAgain) {
    return current;
  }

  await markActivityRecognitionRequested();
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    {
      title: 'Allow step sensor access?',
      message: 'GapWalk uses your device step sensor during an active walk so step tracking can stay accurate.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );

  if (status === PermissionsAndroid.RESULTS.GRANTED) {
    return {
      granted: true,
      canAskAgain: true,
      status: 'granted',
    };
  }

  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return {
      granted: false,
      canAskAgain: false,
      status: 'never_ask_again',
    };
  }

  return {
    granted: false,
    canAskAgain: true,
    status: 'denied',
  };
}
