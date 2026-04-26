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

const createGoogleSignInCancelledError = (statusCode?: string): Error & { code?: string } => {
  const error = new Error('Google sign-in was cancelled.') as Error & { code?: string };
  if (statusCode) {
    error.code = statusCode;
  }
  return error;
};

const logGoogleCalendarDebug = (message: string, payload?: Record<string, unknown>) => {
  if (!__DEV__) return;
  if (payload) {
    console.log(`[googleCalendar] ${message}`, payload);
    return;
  }
  console.log(`[googleCalendar] ${message}`);
};

type GoogleServicesJson = {
  client?: Array<{
    client_info?: {
      android_client_info?: {
        package_name?: string;
      };
    };
    oauth_client?: Array<{
      client_id?: string;
      client_type?: number;
      android_info?: {
        package_name?: string;
      };
    }>;
  }>;
};

type AndroidGoogleServicesExtra = {
  hasAndroidOauthClient?: boolean;
  packageName?: string;
  webClientId?: string;
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

const configureGoogleSignin = () => {
  const { GoogleSignin } = getGoogleSignin();
  GoogleSignin.configure({
    scopes: SCOPES,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: false,
  });
  return GoogleSignin;
};

const extractAccessToken = (tokens: { accessToken?: string | null } | null | undefined): string | null => {
  const accessToken = tokens?.accessToken?.trim();
  return accessToken ? accessToken : null;
};

const getGrantedScopes = (currentUser: { scopes?: unknown } | null | undefined): string[] =>
  Array.isArray(currentUser?.scopes)
    ? currentUser.scopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

const ensureCalendarScopesGranted = async (): Promise<void> => {
  if (Platform.OS === 'web') return;

  const { statusCodes } = getGoogleSignin();
  const GoogleSignin = configureGoogleSignin();
  const currentUser = GoogleSignin.getCurrentUser?.();
  if (!currentUser) return;

  const grantedScopes = getGrantedScopes(currentUser);
  const needsCalendarScope = !grantedScopes.includes(SCOPES[0]);
  const shouldPromptScopes = Platform.OS === 'android' || needsCalendarScope;

  logGoogleCalendarDebug('ensuring scopes', {
    platform: Platform.OS,
    grantedScopes,
    shouldPromptScopes,
  });

  if (!shouldPromptScopes) return;

  const scopeResponse = await GoogleSignin.addScopes({ scopes: SCOPES });
  if (scopeResponse?.type === 'cancelled') {
    throw createGoogleSignInCancelledError(statusCodes.SIGN_IN_CANCELLED);
  }
};

const getCurrentAccessToken = async (): Promise<string | null> => {
  const GoogleSignin = configureGoogleSignin();
  const currentUser = GoogleSignin.getCurrentUser?.();
  if (!currentUser) return null;

  await ensureCalendarScopesGranted();

  const grantedScopes = getGrantedScopes(GoogleSignin.getCurrentUser?.());
  const tokens = await GoogleSignin.getTokens().catch(() => null);
  const accessToken = extractAccessToken(tokens);

  logGoogleCalendarDebug('fetched tokens', {
    grantedScopes,
    hasAccessToken: !!accessToken,
    hasIdToken: !!tokens?.idToken,
  });

  return accessToken;
};

const refreshAccessToken = async (invalidAccessToken?: string): Promise<string | null> => {
  if (Platform.OS === 'web') return null;

  const GoogleSignin = configureGoogleSignin();
  if (Platform.OS === 'android' && invalidAccessToken) {
    try {
      await GoogleSignin.clearCachedAccessToken(invalidAccessToken);
    } catch {
      // Ignore token cache clearing failures and still try to fetch a fresh token.
    }
  }

  return getCurrentAccessToken();
};

const isInvalidCredentialsError = (status: number, body: string): boolean => {
  if (status !== 401) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('invalid credentials') ||
    lower.includes('autherror') ||
    lower.includes('unauthenticated')
  );
};

const fetchGoogleCalendarResponse = async (accessToken: string, days: number): Promise<Response> => {
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

  return fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
};

const mapGoogleCalendarEvents = (
  data: GoogleCalendarEventsResponse,
  createdAt: string,
  fallbackIso: string
): BusyEvent[] => {
  const items = data.items ?? [];

  return items
    .filter((item) => item.status !== 'cancelled')
    .map((item) => ({
      id: `google-${item.id ?? `${item.start?.dateTime || item.start?.date || 'unknown'}-${item.summary || 'busy'}`}`,
      title: item.summary || 'Busy',
      start: item.start?.dateTime || item.start?.date || fallbackIso,
      end: item.end?.dateTime || item.end?.date || fallbackIso,
      source: 'google' as const,
      isAllDay: !item.start?.dateTime,
      createdAt,
    }));
};

/**
 * Start the native Google Sign-In flow and return a Google Calendar
 * access token on success.  Uses @react-native-google-signin/google-signin
 * (native SDK) to avoid the custom-URI-scheme restriction on Android.
 */
export async function signInWithGoogle(): Promise<string> {
  const { statusCodes } = getGoogleSignin();
  const GoogleSignin = configureGoogleSignin();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Revoke the prior grant before sign-in so Android does not get stuck in a
  // stale remote-consent loop after Google project or SHA changes.
  try { await GoogleSignin.revokeAccess(); } catch { /* ignore if no grant exists */ }

  // Sign out any previously cached account so the account picker always appears.
  try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in */ }

  const response = await GoogleSignin.signIn();
  if (response?.type !== 'success') {
    throw createGoogleSignInCancelledError(statusCodes.SIGN_IN_CANCELLED);
  }

  logGoogleCalendarDebug('sign-in success', {
    email: response.data?.user?.email ?? null,
    grantedScopes: getGrantedScopes(response.data),
    hasServerAuthCode: !!response.data?.serverAuthCode,
    hasIdToken: !!response.data?.idToken,
  });

  const accessToken = await getCurrentAccessToken();
  if (!accessToken) {
    throw new Error(
      'Google sign-in completed but no access token was returned. Check the Google web client ID configuration for this build.'
    );
  }
  return accessToken;
}

const FALLBACK_NATIVE_APP_ID = 'com.gapwalk.app';

const getAndroidGoogleServices = (): GoogleServicesJson | null => {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../google-services.json') as GoogleServicesJson;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../../android/app/google-services.json') as GoogleServicesJson;
    } catch {
      return null;
    }
  }
};

const androidGoogleServices = getAndroidGoogleServices();
const androidGoogleServicesExtra = (() => {
  const extra = Constants.expoConfig?.extra as
    | { androidGoogleServices?: AndroidGoogleServicesExtra }
    | undefined;
  return extra?.androidGoogleServices ?? {};
})();
const androidGoogleClient = androidGoogleServices?.client?.[0];
const androidGoogleWebClientId =
  androidGoogleClient?.oauth_client
    ?.find((client) => client.client_type === 3)
    ?.client_id?.trim() || androidGoogleServicesExtra.webClientId?.trim() || '';
const hasAndroidOauthClientFromJson = androidGoogleClient?.oauth_client?.some(
  (client) =>
    client.client_type === 1 &&
    client.android_info?.package_name ===
      (androidGoogleClient?.client_info?.android_client_info?.package_name ??
        FALLBACK_NATIVE_APP_ID)
);
const hasAndroidOauthClient =
  hasAndroidOauthClientFromJson ?? androidGoogleServicesExtra.hasAndroidOauthClient;

/*
 * ── Google OAuth Configuration ──
 *
 * To enable Google Calendar:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or select an existing one).
 * 3. Enable the "Google Calendar API" under APIs & Services → Library.
 * 4. Use one Google project consistently:
 *    a. Create a Web client for browser auth and token exchange.
 *    b. Register Android package name + SHA-1 in the same project as google-services.json.
 *    c. Create an iOS client for your bundle identifier.
 * 5. Do not create duplicate Android OAuth clients in a different Google project.
 *
 * Native builds in this app return to:
 *   com.gapwalk.app:/oauthredirect
 */

// Prefer env vars so you can set in .env without editing code (restart app after changing).
const GOOGLE_WEB_CLIENT_ID =
  (Platform.OS === 'android' && androidGoogleWebClientId) ||
  (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

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

  if (Platform.OS === 'ios') {
    if (isPlaceholderClientId(GOOGLE_IOS_CLIENT_ID)) {
      return `Google Calendar is not configured for iOS. Create an iOS OAuth client for ${getNativeAppId()} and set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env.`;
    }

    if (GOOGLE_IOS_CLIENT_ID === GOOGLE_WEB_CLIENT_ID) {
      return 'Google Calendar is misconfigured for iOS. EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must use an iOS OAuth client ID, not the same value as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.';
    }

    return null;
  }

  if (isPlaceholderClientId(GOOGLE_WEB_CLIENT_ID)) {
    return `Google Calendar is not configured for Android. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or add google-services.json for ${getNativeAppId()}.`;
  }

  if (hasAndroidOauthClient === false) {
    return `Google Calendar is not configured for Android. Register ${getNativeAppId()} and its signing SHA-1 in the same Google project as google-services.json.`;
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
    const createdAt = new Date().toISOString();
    const fallbackIso = new Date().toISOString();

    const response = await fetchGoogleCalendarResponse(accessToken, days);
    if (response.ok) {
      const data = (await response.json()) as GoogleCalendarEventsResponse;
      return mapGoogleCalendarEvents(data, createdAt, fallbackIso);
    }

    const body = await response.text();
    if (isInvalidCredentialsError(response.status, body)) {
      const refreshedAccessToken = await refreshAccessToken(accessToken);
      if (refreshedAccessToken) {
        const retryResponse = await fetchGoogleCalendarResponse(refreshedAccessToken, days);
        if (retryResponse.ok) {
          const retryData = (await retryResponse.json()) as GoogleCalendarEventsResponse;
          return mapGoogleCalendarEvents(retryData, createdAt, fallbackIso);
        }

        const retryBody = await retryResponse.text();
        throw new Error(`Google Calendar API error (${retryResponse.status}): ${retryBody}`);
      }
    }

    throw new Error(`Google Calendar API error (${response.status}): ${body}`);
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
