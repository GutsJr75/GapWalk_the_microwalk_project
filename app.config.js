/**
 * Dynamic Expo config — extends app.json and injects the iOS URL scheme
 * required by @react-native-google-signin/google-signin from the env var
 * EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID so it doesn't need to be hardcoded.
 */
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.split('.apps.googleusercontent.com')[0]}`
    : undefined;

  const googleSignInPlugin = iosUrlScheme
    ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
    : '@react-native-google-signin/google-signin';

  return {
    ...config,
    plugins: [...(config.plugins || []), googleSignInPlugin],
  };
};
