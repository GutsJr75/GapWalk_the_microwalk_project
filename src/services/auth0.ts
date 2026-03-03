import * as AuthSession from 'expo-auth-session';

const domain = (process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '').trim();
const clientId = (process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '').trim();
const audience = (process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '').trim();

const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

export const isAuth0Configured = (): boolean => {
  return normalizedDomain.length > 0 && clientId.length > 0;
};

export const getAuth0Discovery = (): AuthSession.DiscoveryDocument | null => {
  if (!isAuth0Configured()) return null;
  const issuer = `https://${normalizedDomain}`;
  return {
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/oauth/token`,
    revocationEndpoint: `${issuer}/oauth/revoke`,
  };
};

export const getAuth0RequestConfig = (
  mode: 'login' | 'signup'
): AuthSession.AuthRequestConfig => {
  const baseExtraParams: Record<string, string> = {
    ...(audience ? { audience } : {}),
    prompt: 'login',
  };

  if (mode === 'signup') {
    baseExtraParams.screen_hint = 'signup';
  }

  return {
    clientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    redirectUri: AuthSession.makeRedirectUri({
      path: 'auth/callback',
    }),
    extraParams: baseExtraParams,
  };
};
