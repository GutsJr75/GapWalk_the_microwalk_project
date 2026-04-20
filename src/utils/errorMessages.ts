import { Platform } from 'react-native';

/**
 * Converts technical error messages into human-readable text
 * so users can understand what went wrong without technical knowledge.
 */
const getGoogleSignInMisconfiguredMessage = (): string => {
  if (Platform.OS !== 'android') {
    return 'Google sign-in is misconfigured for this build. Confirm the client IDs are registered in the same Google project as your app configuration, then rebuild the app.';
  }

  if (__DEV__) {
    return 'Google sign-in is misconfigured for this local debug build. Register com.gapwalk.app with the SHA-1 from android/app/gapwalk-local-debug.jks (or your GAPWALK_DEBUG_* override keystore) in the same Google project as google-services.json, then rebuild and reinstall the app.';
  }

  return 'Google sign-in is misconfigured for this Android build. If this APK was sideloaded, register the upload or EAS signing SHA-1. If it was installed from Google Play, register the Play App Signing SHA-1. In both cases use the same Google project as google-services.json, then rebuild and reinstall the app.';
};

const isGoogleSignInMisconfiguredError = (lower: string): boolean =>
  lower.includes('developer_error') ||
  lower.includes('non recoverable sign in failure') ||
  lower.includes('non-recoverable sign in failure') ||
  lower.includes('google sign-in completed but no id token') ||
  lower.includes('google sign-in completed but no access token') ||
  lower.includes(
    'follow troubleshooting instructions at https://react-native-google-signin.github.io/docs/troubleshooting'
  ) ||
  (lower.includes('12500') &&
    (lower.includes('google') ||
      lower.includes('sign in') ||
      lower.includes('signin')));

export function toUserFriendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  // Database / storage errors
  if (lower.includes('sqlite3_open') || lower.includes('cannot create file') || lower.includes('getdirectory')) {
    return 'The app could not access local storage. On web, try a different browser (Firefox or Safari) or use the app on your phone.';
  }
  if (lower.includes("reading 'decode'") || lower.includes('undefined') && lower.includes('decode')) {
    return 'A storage compatibility issue occurred. Try refreshing the page or use the app on your phone.';
  }
  if (lower.includes('sqlite') || lower.includes('database') || lower.includes('disk') || lower.includes('quota')) {
    return 'Storage is full or the app data could not be saved. Try freeing up space on your device and try again.';
  }
  if (lower.includes('locked') || lower.includes('busy')) {
    return 'The app is busy saving data. Please wait a moment and try again.';
  }
  if (lower.includes('constraint') || lower.includes('unique') || lower.includes('primary key')) {
    return 'This item already exists. Please refresh and try again.';
  }
  if (lower.includes('no such table') || lower.includes('table') && lower.includes('not found')) {
    return 'App data may be corrupted. Try closing and reopening the app, or reinstalling if the problem continues.';
  }

  // Network errors
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch')) {
    return 'Unable to connect. Check your internet connection and try again.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request took too long. Check your connection and try again.';
  }
  if (
    lower.includes('google calendar api error (401)') ||
    (lower.includes('invalid credentials') && lower.includes('google'))
  ) {
    return 'Google Calendar authorization is invalid for this build. Try linking Google Calendar again. If you recently changed google-services.json or SHA-1 settings, rebuild and reinstall the Android app.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('session expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return 'You don\'t have permission to do this. Please sign in with the correct account.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'The requested item was not found. It may have been removed.';
  }
  if (lower.includes('500') || lower.includes('server error')) {
    return 'Something went wrong on our end. Please try again in a few minutes.';
  }

  // Firebase Authentication errors
  if (lower.includes('auth/invalid-email')) {
    return 'Enter a valid email address.';
  }
  if (lower.includes('auth/invalid-api-key')) {
    return 'Firebase Authentication is misconfigured for this build. Update google-services.json or the EXPO_PUBLIC_FIREBASE_* values, then rebuild the app.';
  }
  if (lower.includes('auth/missing-password') || lower.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters.';
  }
  if (lower.includes('auth/invalid-credential') || lower.includes('auth/wrong-password') || lower.includes('auth/user-not-found')) {
    return 'The email or password is incorrect.';
  }
  if (lower.includes('auth/email-already-in-use')) {
    return 'That email is already linked to an account. Try logging in instead.';
  }
  if (lower.includes('auth/too-many-requests')) {
    return 'Too many attempts were made. Please wait a bit and try again.';
  }
  if (lower.includes('auth/popup-closed-by-user') || lower.includes('auth/cancelled-popup-request')) {
    return 'The sign-in window was closed before the process finished.';
  }
  if (isGoogleSignInMisconfiguredError(lower)) {
    return getGoogleSignInMisconfiguredMessage();
  }
  if (lower.includes('play_services_not_available')) {
    return 'Google Play Services is unavailable or out of date on this device.';
  }

  // File / import errors
  if (lower.includes('could not read') || lower.includes('file') && lower.includes('empty')) {
    return 'The file could not be read or is empty. Choose a different file.';
  }
  if (lower.includes('ics') || lower.includes('calendar') && (lower.includes('parse') || lower.includes('invalid'))) {
    return 'The calendar file format is invalid. Make sure you selected a valid .ics file.';
  }
  if (lower.includes('failed to parse') || lower.includes('parse error')) {
    return 'The file could not be read correctly. Some events may have been skipped. Try a different calendar file.';
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('access')) {
    return 'Permission was denied. Please allow access when prompted.';
  }

  // Generic fallbacks for common patterns
  if (lower.includes('undefined') || lower.includes('null') || lower.includes('cannot read')) {
    return 'Something went wrong. Please try again.';
  }
  if (raw.length > 80 || /^[A-Z_]+$/.test(raw) || raw.includes('Error:')) {
    return 'Something went wrong. Please try again. If the problem continues, try restarting the app.';
  }

  // If the message is already short and readable, use it (but sanitize)
  if (raw.length <= 60 && !raw.includes('Error') && !raw.includes('Exception')) {
    return raw;
  }

  return 'Something went wrong. Please try again.';
}
