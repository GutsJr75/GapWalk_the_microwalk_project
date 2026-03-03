import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { BusyEvent } from '../types';

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

const GOOGLE_WEB_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) || '';
const GOOGLE_IOS_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) || '';
const GOOGLE_ANDROID_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) || '';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const isPlaceholderClientId = (value: string): boolean =>
  !value || value.startsWith('YOUR_') || value.startsWith('your_');

let _configured = false;

/** One-time native Google Sign-In configuration. Safe to call multiple times. */
export function configureGoogleSignIn(): void {
  if (_configured) return;

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: SCOPES,
    offlineAccess: true,
  });

  _configured = true;
}

/**
 * Trigger native Google Sign-In and return a Calendar-scoped access token.
 * Throws on cancellation or other errors.
 */
export async function signInWithGoogle(): Promise<string> {
  configureGoogleSignIn();

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  await GoogleSignin.signIn();
  const tokens = await GoogleSignin.getTokens();

  if (!tokens.accessToken) {
    throw new Error(
      'Google sign-in completed without an access token. Check the OAuth client configuration and try again.',
    );
  }

  return tokens.accessToken;
}

/** Sign out the current Google account (silent, never throws). */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}

/** Whether the given error represents the user cancelling the sign-in prompt. */
export function isSignInCancelled(error: unknown): boolean {
  return isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED;
}

export function getGoogleConfigurationError(): string | null {
  if (
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return 'Google Calendar sign-in is not supported in Expo Go. Use a development build or the installed app.';
  }

  if (Platform.OS === 'web') {
    return 'Google Calendar sign-in requires a native build. Web is not yet supported.';
  }

  if (isPlaceholderClientId(GOOGLE_WEB_CLIENT_ID)) {
    return 'Google Calendar is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.';
  }

  if (Platform.OS === 'ios' && isPlaceholderClientId(GOOGLE_IOS_CLIENT_ID)) {
    return 'Google Calendar is not configured for iOS. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env.';
  }

  if (Platform.OS === 'android' && isPlaceholderClientId(GOOGLE_ANDROID_CLIENT_ID)) {
    return 'Google Calendar is not configured for Android. Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in .env.';
  }

  return null;
}

/** Whether Google Calendar is properly configured (client IDs are set). */
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
      { headers: { Authorization: `Bearer ${accessToken}` } },
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

  /** Validate whether an access token is still usable. */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
      );
      return res.ok;
    } catch {
      return false;
    }
  },
};
