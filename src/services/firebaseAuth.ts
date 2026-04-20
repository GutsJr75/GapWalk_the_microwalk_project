import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Platform } from 'react-native';
import { authStorage, type StoredAuthUser } from '../data/authStorage';

type FirebaseAuthModule = typeof import('firebase/auth');
type ReactNativeFirebaseAuthModule = FirebaseAuthModule & {
  getReactNativePersistence?: (
    storage: typeof AsyncStorage
  ) => NonNullable<Parameters<FirebaseAuthModule['initializeAuth']>[1]>['persistence'];
};

const getFirebaseAuthModule = (): FirebaseAuthModule =>
  // Metro can resolve the React Native-specific auth entrypoint from the public package.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('firebase/auth') as FirebaseAuthModule;

const isExpoGo =
  Platform.OS !== 'web' &&
  (Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo');

const getGoogleSignin = (): { GoogleSignin: any; statusCodes: any } => {
  if (isExpoGo) {
    throw new Error(
      'Google sign-in is not supported in Expo Go. Use a development build or an installed app build.'
    );
  }
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

type GoogleServicesJson = {
  project_info?: {
    project_number?: string;
    project_id?: string;
    storage_bucket?: string;
  };
  client?: Array<{
    client_info?: {
      mobilesdk_app_id?: string;
      android_client_info?: {
        package_name?: string;
      };
    };
    oauth_client?: Array<{
      client_id?: string;
      client_type?: number;
    }>;
    api_key?: Array<{
      current_key?: string;
    }>;
  }>;
};

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
const androidClient = androidGoogleServices?.client?.[0];
const androidFirebaseFallback = {
  apiKey: androidClient?.api_key?.[0]?.current_key?.trim() ?? '',
  projectId: androidGoogleServices?.project_info?.project_id?.trim() ?? '',
  storageBucket: androidGoogleServices?.project_info?.storage_bucket?.trim() ?? '',
  messagingSenderId: androidGoogleServices?.project_info?.project_number?.trim() ?? '',
  appId: androidClient?.client_info?.mobilesdk_app_id?.trim() ?? '',
  webClientId:
    androidClient?.oauth_client
      ?.find((client) => client.client_type === 3)
      ?.client_id?.trim() ?? '',
};

const resolveAndroidValue = (fallback: string, envValue: string): string =>
  Platform.OS === 'android' && fallback ? fallback : envValue;

const firebaseConfig = {
  apiKey: resolveAndroidValue(
    androidFirebaseFallback.apiKey,
    (process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '').trim()
  ),
  authDomain: (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '').trim(),
  projectId: resolveAndroidValue(
    androidFirebaseFallback.projectId,
    (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim()
  ),
  storageBucket: resolveAndroidValue(
    androidFirebaseFallback.storageBucket,
    (process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '').trim()
  ),
  messagingSenderId: resolveAndroidValue(
    androidFirebaseFallback.messagingSenderId,
    (process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '').trim()
  ),
  appId: resolveAndroidValue(
    androidFirebaseFallback.appId,
    (process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '').trim()
  ),
  measurementId: (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '').trim(),
};

const GOOGLE_WEB_CLIENT_ID = resolveAndroidValue(
  androidFirebaseFallback.webClientId,
  (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim()
);
const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

const missingFirebaseKeys = (): string[] => {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey) missing.push('EXPO_PUBLIC_FIREBASE_API_KEY');
  if (!firebaseConfig.projectId) missing.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.messagingSenderId) {
    missing.push('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  }
  if (!firebaseConfig.appId) missing.push('EXPO_PUBLIC_FIREBASE_APP_ID');
  if (Platform.OS === 'web' && !firebaseConfig.authDomain) {
    missing.push('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
  }
  return missing;
};

let cachedAuth:
  | ReturnType<FirebaseAuthModule['getAuth']>
  | null = null;
let cachedAuthInitializationError: Error | null = null;

const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown Firebase configuration error.');
};

const getRuntimeFirebaseConfigurationError = (): string | null => {
  if (!cachedAuthInitializationError) return null;

  const message = cachedAuthInitializationError.message.toLowerCase();
  if (message.includes('auth/invalid-api-key') || message.includes('invalid-api-key')) {
    return 'Firebase Authentication is misconfigured for this build. The Firebase API key is invalid. Update google-services.json or the EXPO_PUBLIC_FIREBASE_* values, then rebuild the app.';
  }

  return `Firebase Authentication is misconfigured for this build. ${cachedAuthInitializationError.message}`;
};

const buildStoredAuthUser = (
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified?: boolean | null;
    providerId?: string | null;
    providerData?: Array<{ providerId?: string | null } | null> | null;
  } | null
): StoredAuthUser | null => {
  if (!user) return null;
  const name = user.displayName?.trim();
  const primaryProviderId =
    user.providerData?.find((entry) => entry?.providerId)?.providerId ??
    user.providerId ??
    undefined;
  return {
    email: user.email ?? undefined,
    name: name && !name.includes('@') ? name : undefined,
    uid: user.uid,
    providerId: primaryProviderId,
    emailVerified: typeof user.emailVerified === 'boolean' ? user.emailVerified : undefined,
  };
};

const persistAuthMetadata = async (
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified?: boolean | null;
    providerData?: Array<{ providerId?: string | null } | null> | null;
  }
): Promise<StoredAuthUser> => {
  const primaryProviderId =
    user.providerData?.find((entry) => entry?.providerId)?.providerId ?? null;
  const storedUser = buildStoredAuthUser({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    providerId: primaryProviderId,
    providerData: user.providerData,
  }) ?? { uid: user.uid };
  await authStorage.saveUser(storedUser);
  await authStorage.saveLastLoginAt(new Date().toISOString());
  return storedUser;
};

const getFirebaseApp = () => {
  if (!getApps().length) {
    initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain || undefined,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket || undefined,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
      measurementId: firebaseConfig.measurementId || undefined,
    });
  }
  return getApp();
};

const getConfiguredAuth = () => {
  if (cachedAuth) return cachedAuth;
  if (cachedAuthInitializationError) throw cachedAuthInitializationError;

  try {
    const app = getFirebaseApp();
    const authModule = getFirebaseAuthModule();
    if (Platform.OS === 'web') {
      cachedAuth = authModule.getAuth(app);
      return cachedAuth;
    }

    try {
      const reactNativeAuthModule = authModule as ReactNativeFirebaseAuthModule;
      const persistence = reactNativeAuthModule.getReactNativePersistence?.(AsyncStorage);
      cachedAuth = persistence
        ? authModule.initializeAuth(app, { persistence })
        : authModule.getAuth(app);
    } catch {
      cachedAuth = authModule.getAuth(app);
    }

    return cachedAuth;
  } catch (error) {
    cachedAuthInitializationError = toError(error);
    throw cachedAuthInitializationError;
  }
};

const ensureGoogleSigninConfigured = () => {
  const { GoogleSignin } = getGoogleSignin();
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    offlineAccess: false,
  });
  return GoogleSignin;
};

export const getFirebaseConfigurationError = (): string | null => {
  const missing = missingFirebaseKeys();
  if (missing.length > 0) {
    return `Firebase Authentication is not configured. Add ${missing.join(', ')} to your .env file.`;
  }
  return getRuntimeFirebaseConfigurationError();
};

export const isFirebaseConfigured = (): boolean =>
  getFirebaseConfigurationError() === null;

export const getGoogleAuthConfigurationError = (): string | null => {
  if (!isFirebaseConfigured()) {
    return getFirebaseConfigurationError();
  }
  if (isExpoGo) {
    return 'Google sign-in is not supported in Expo Go. Use a development build or an installed app build.';
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.';
  }
  return null;
};

export const isGoogleAuthConfigured = (): boolean =>
  getGoogleAuthConfigurationError() === null;

export const isGoogleSignInCancelled = (error: unknown): boolean => {
  if (Platform.OS === 'web') return false;
  if (!error || typeof error !== 'object') return false;
  try {
    const { statusCodes } = getGoogleSignin();
    return (error as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED;
  } catch {
    return false;
  }
};

export const requiresEmailVerification = (user: StoredAuthUser | null): boolean =>
  !!user &&
  user.providerId === 'password' &&
  user.emailVerified === false;

export const firebaseAuthService = {
  getAuth() {
    return getConfiguredAuth();
  },

  async waitForAuthReady(): Promise<void> {
    const auth = getConfiguredAuth();
    await auth.authStateReady();
  },

  getCurrentUser(): StoredAuthUser | null {
    const auth = getConfiguredAuth();
    return buildStoredAuthUser(auth.currentUser);
  },

  async refreshCurrentUser(): Promise<StoredAuthUser | null> {
    await this.waitForAuthReady();
    const auth = getConfiguredAuth();
    if (!auth.currentUser) return null;
    await auth.currentUser.reload();
    return buildStoredAuthUser(auth.currentUser);
  },

  async getIdToken(forceRefresh = false): Promise<string | null> {
    await this.waitForAuthReady();
    const auth = getConfiguredAuth();
    if (!auth.currentUser) return null;
    const currentUser = buildStoredAuthUser(auth.currentUser);
    if (requiresEmailVerification(currentUser)) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  },

  onAuthStateChanged(listener: (user: StoredAuthUser | null) => void): () => void {
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    return authModule.onAuthStateChanged(auth, (user) => {
      listener(buildStoredAuthUser(user));
    });
  },

  async signInWithEmail(email: string, password: string): Promise<StoredAuthUser> {
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    const result = await authModule.signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    return persistAuthMetadata(result.user);
  },

  async signUpWithEmail(email: string, password: string): Promise<StoredAuthUser> {
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    const result = await authModule.createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    await authModule.sendEmailVerification(result.user);
    return persistAuthMetadata(result.user);
  },

  async sendCurrentUserVerificationEmail(): Promise<void> {
    await this.waitForAuthReady();
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    if (!auth.currentUser) {
      throw new Error('No active session. Please log in again.');
    }
    await authModule.sendEmailVerification(auth.currentUser);
  },

  async sendPasswordReset(email: string): Promise<void> {
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    await authModule.sendPasswordResetEmail(auth, email.trim());
  },

  async changePassword(currentPassword: string, nextPassword: string): Promise<void> {
    await this.waitForAuthReady();
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('No active email/password session. Please log in again.');
    }

    const providerIds = (currentUser.providerData ?? [])
      .map((provider) => provider?.providerId)
      .filter((id): id is string => !!id);
    if (!providerIds.includes('password')) {
      throw new Error('Password changes are available only for email/password accounts.');
    }

    const credential = authModule.EmailAuthProvider.credential(
      currentUser.email,
      currentPassword
    );
    await authModule.reauthenticateWithCredential(currentUser, credential);
    await authModule.updatePassword(currentUser, nextPassword);
    await authStorage.saveLastLoginAt(new Date().toISOString());
  },

  async signInWithGoogle(): Promise<StoredAuthUser> {
    const googleAuthConfigurationError = getGoogleAuthConfigurationError();
    if (googleAuthConfigurationError) {
      throw new Error(googleAuthConfigurationError);
    }

    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();

    if (Platform.OS === 'web') {
      const provider = new authModule.GoogleAuthProvider();
      const result = await authModule.signInWithPopup(auth, provider);
      return persistAuthMetadata(result.user);
    }

    const { statusCodes } = getGoogleSignin();
    const GoogleSignin = ensureGoogleSigninConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore stale sign-in state.
    }

    const response = await GoogleSignin.signIn();
    if (response?.type !== 'success') {
      throw createGoogleSignInCancelledError(statusCodes.SIGN_IN_CANCELLED);
    }

    const idToken =
      response.data?.idToken ||
      (await GoogleSignin.getTokens().catch(() => null))?.idToken;
    if (!idToken) {
      throw new Error(
        'Google sign-in completed but no ID token was returned. Check the Google web client ID configuration for this build.'
      );
    }

    const credential = authModule.GoogleAuthProvider.credential(
      idToken
    );
    const result = await authModule.signInWithCredential(auth, credential);
    return persistAuthMetadata(result.user);
  },

  async signOut(): Promise<void> {
    const authModule = getFirebaseAuthModule();
    const auth = getConfiguredAuth();
    await authModule.signOut(auth);
    if (Platform.OS !== 'web') {
      try {
        const { GoogleSignin } = getGoogleSignin();
        await GoogleSignin.signOut();
      } catch {
        // Ignore if Google was never used for the current session.
      }
    }
  },
};
