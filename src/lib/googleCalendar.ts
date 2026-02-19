import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { BusyEvent } from './types';

WebBrowser.maybeCompleteAuthSession();

let hasLoggedRedirectUri = false;
const shouldLogOAuthRedirect =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DEBUG_OAUTH === '1';

/*
 * ── Google OAuth Configuration ──
 *
 * To enable Google Calendar:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or select an existing one).
 * 3. Enable the "Google Calendar API" under APIs & Services → Library.
 * 4. Under APIs & Services → Credentials → Create Credentials → OAuth client ID:
 *    a. For Web: set Authorized redirect URIs to the URI logged below.
 *    b. For Android: add your package name + SHA-1 fingerprint.
 *    c. For iOS: add your bundle identifier.
 * 5. Paste your client IDs below.
 *
 * The redirect URI used by expo-auth-session is logged at startup
 * so you can copy it into the Google Cloud Console.
 */

// Prefer env vars so you can set in .env without editing code (restart app after changing).
const GOOGLE_WEB_CLIENT_ID = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) || 'YOUR_GOOGLE_WEB_CLIENT_ID';
const GOOGLE_IOS_CLIENT_ID = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) || 'YOUR_GOOGLE_IOS_CLIENT_ID';
const GOOGLE_ANDROID_CLIENT_ID = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) || 'YOUR_GOOGLE_ANDROID_CLIENT_ID';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

/** Google OAuth discovery document (standard endpoints) */
export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/** Get the redirect URI used for OAuth (so you can add it in Google Cloud Console). */
export function getGoogleRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'gapwalk' });
}

/** Build AuthSession.AuthRequestConfig for Google Calendar */
export function getGoogleAuthConfig(): AuthSession.AuthRequestConfig {
  const redirectUri = getGoogleRedirectUri();

  if (__DEV__ && shouldLogOAuthRedirect && !hasLoggedRedirectUri) {
    console.log('[GapWalk] Google OAuth redirect URI:', redirectUri);
    hasLoggedRedirectUri = true;
  }

  return {
    clientId: Platform.select({
      ios: GOOGLE_IOS_CLIENT_ID,
      android: GOOGLE_ANDROID_CLIENT_ID,
      default: GOOGLE_WEB_CLIENT_ID,
    })!,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Token, // implicit grant → access token
  };
}

/** Whether Google Calendar is properly configured (client IDs are set) */
export const isGoogleConfigured = (): boolean => {
  const id = Platform.select({
    ios: GOOGLE_IOS_CLIENT_ID,
    android: GOOGLE_ANDROID_CLIENT_ID,
    default: GOOGLE_WEB_CLIENT_ID,
  });
  return !!id && !id.startsWith('YOUR_');
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

    const data = await response.json();
    const items: any[] = data.items ?? [];

    return items
      .filter((item: any) => item.status !== 'cancelled')
      .map((item: any) => ({
        id: `google-${item.id}`,
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
