const fs = require('fs');
const path = require('path');

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
  const androidGoogleServicesCandidates = [
    config.android?.googleServicesFile
      ? path.resolve(__dirname, config.android.googleServicesFile)
      : null,
    path.resolve(__dirname, 'google-services.json'),
    path.resolve(__dirname, 'android/app/google-services.json'),
  ].filter(Boolean);
  const hasAndroidGoogleServices = androidGoogleServicesCandidates.some((candidatePath) =>
    fs.existsSync(candidatePath)
  );

  const googleSignInPlugin = iosUrlScheme
    ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
    : '@react-native-google-signin/google-signin';

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      hasAndroidGoogleServices,
    },
    plugins: [...(config.plugins || []), googleSignInPlugin],
  };
};
