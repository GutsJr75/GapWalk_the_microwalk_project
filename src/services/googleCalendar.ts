import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { BusyEvent } from '../types';

// Lazy-load the native Google Sign-In module to avoid crashing in Expo Go
// where the RNGoogleSignin native binary is not present.
const getGoogleSignin = (): { GoogleSignin: any; statusCodes: any } => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@react-native-google-signin/google-signin');
};

interface GoogleCalendarEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  status?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
}

WebBrowser.maybeCompleteAuthSession();

/** Returns true when the error came from the user cancelling the sign-in. */
export const isSignInCancelled = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const { statusCodes } = getGoogleSignin();
  return (error as any).code === statusCodes.SIGN_IN_CANCELLED;
};

/**
 * Start the native Google Sign-In flow and return a Google Calendar
 * access token on success.  Uses @react-native-google-signin/google-signin
 * (native SDK) to avoid the custom-URI-scheme restriction on Android.
 */
export async function signInWithGoogle(): Promise<string> {
  const { GoogleSignin } = getGoogleSignin();

  GoogleSignin.configure({
    scopes: SCOPES,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Sign out any previously cached account so the account picker always appears,
  // allowing the user to choose a different Google account each time.
  try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in */ }

  await GoogleSignin.signIn();

  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) {
    throw new Error(
      'Google sign-in completed but no access token was returned.'
    );
  }
  return tokens.accessToken;
}

const FALLBACK_NATIVE_APP_ID = 'com.gapwalk.app';

/*
 * ── Google OAuth Configuration ──
 *
 * To enable Google Calendar:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or select an existing one).
 * 3. Enable the "Google Calendar API" under APIs & Services → Library.
 * 4. Under APIs & Services → Credentials → Create Credentials → OAuth client ID:
 *    a. Create a Web client for browser auth.
 *    b. Create an Android client for your package name + SHA-1 fingerprint.
 *    c. Create an iOS client for your bundle identifier.
 * 5. Paste the platform-specific client IDs below. Do not reuse the web client ID on iOS/Android.
 *
 * Native builds in this app return to:
 *   com.gapwalk.app:/oauthredirect
 */

// Prefer env vars so you can set in .env without editing code (restart app after changing).
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'YOUR_GOOGLE_WEB_CLIENT_ID';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'YOUR_GOOGLE_IOS_CLIENT_ID';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'YOUR_GOOGLE_ANDROID_CLIENT_ID';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const isPlaceholderClientId = (value: string): boolean =>
  !value || value.startsWith('YOUR_') || value.startsWith('your_');

const getNativeAppId = (): string => {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.ios?.bundleIdentifier ?? FALLBACK_NATIVE_APP_ID;
  }
  if (Platform.OS === 'android') {
    return Constants.expoConfig?.android?.package ?? FALLBACK_NATIVE_APP_ID;
  }
  return FALLBACK_NATIVE_APP_ID;
};


export function getGoogleConfigurationError(): string | null {
  if (
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return 'Google Calendar sign-in is not supported in Expo Go. Use a development build or the installed app.';
  }

  if (Platform.OS === 'web') {
    if (isPlaceholderClientId(GOOGLE_WEB_CLIENT_ID)) {
      return 'Google Calendar is not configured for web. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.';
    }
    return null;
  }

  const envVarName =
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
      : 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
  const nativePlatformLabel = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const nativeAppId = getNativeAppId();
  const nativeClientId =
    Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_ANDROID_CLIENT_ID;

  if (isPlaceholderClientId(nativeClientId)) {
    return `Google Calendar is not configured for ${nativePlatformLabel}. Create a ${nativePlatformLabel} OAuth client for ${nativeAppId} and set ${envVarName} in .env.`;
  }

  if (
    !isPlaceholderClientId(GOOGLE_WEB_CLIENT_ID) &&
    nativeClientId === GOOGLE_WEB_CLIENT_ID
  ) {
    return `Google Calendar is misconfigured for ${nativePlatformLabel}. ${envVarName} must use a platform-specific OAuth client ID, not the same value as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.`;
  }

  return null;
}

/** Whether Google Calendar is properly configured (client IDs are set) */
export const isGoogleConfigured = (): boolean => {
  return getGoogleConfigurationError() === null;
};

export const googleCalendarService = {
  /**
   * Fetch events from the user's primary Google Calendar.
   * @param accessToken A valid Google OAuth access token with calendar.readonly scope.
   * @param days How many days ahead to fetch (default 7).
   */
  async fetchEvents(accessToken: string, days = 7): Promise<BusyEvent[]> {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) as GoogleCalendarEventsResponse;
    const items = data.items ?? [];

    return items
      .filter((item) => item.status !== 'cancelled')
      .map((item) => ({
        id: `google-${item.id ?? `${item.start?.dateTime || item.start?.date || 'unknown'}-${item.summary || 'busy'}`}`,
        title: item.summary || 'Busy',
        start: item.start?.dateTime || item.start?.date || now.toISOString(),
        end: item.end?.dateTime || item.end?.date || now.toISOString(),
        source: 'google' as const,
        isAllDay: !item.start?.dateTime,
        createdAt: new Date().toISOString(),
      }));
  },

  /**
   * Validate whether an access token is still usable.
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );
      return res.ok;
    } catch {
      return false;
    }
  },
};
