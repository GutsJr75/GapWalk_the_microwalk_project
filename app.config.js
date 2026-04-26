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
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  const androidPackageName = config.android?.package || 'com.gapwalk.app';
  const androidGoogleServicesCandidates = [
    process.env.GOOGLE_SERVICES_JSON || null,
    path.resolve(__dirname, 'google-services.json'),
    path.resolve(__dirname, 'android/app/google-services.json'),
    config.android?.googleServicesFile
      ? path.resolve(__dirname, config.android.googleServicesFile)
      : null,
  ].filter(Boolean);
  const hasAndroidGoogleServices = androidGoogleServicesCandidates.some((candidatePath) =>
    fs.existsSync(candidatePath)
  );
  const androidGoogleServicesSource = androidGoogleServicesCandidates.find((candidatePath) =>
    fs.existsSync(candidatePath)
  );
  const androidGoogleServicesJson = (() => {
    if (!androidGoogleServicesSource) return null;
    try {
      return JSON.parse(fs.readFileSync(androidGoogleServicesSource, 'utf8'));
    } catch {
      return null;
    }
  })();
  const androidGoogleClient =
    androidGoogleServicesJson?.client?.find(
      (client) =>
        client?.client_info?.android_client_info?.package_name === androidPackageName
    ) ?? androidGoogleServicesJson?.client?.[0];
  const androidGoogleWebClientId =
    androidGoogleClient?.oauth_client
      ?.find((client) => client?.client_type === 3)
      ?.client_id?.trim() ?? '';
  const androidHasOauthClient =
    androidGoogleClient?.oauth_client?.some(
      (client) =>
        client?.client_type === 1 &&
        client?.android_info?.package_name === androidPackageName
    ) ?? false;
  const androidGoogleServicesFile = (() => {
    const envFilePath = process.env.GOOGLE_SERVICES_JSON;
    if (envFilePath && fs.existsSync(envFilePath)) return envFilePath;
    if (fs.existsSync(path.resolve(__dirname, 'google-services.json'))) {
      return './google-services.json';
    }
    if (fs.existsSync(path.resolve(__dirname, 'android/app/google-services.json'))) {
      return './android/app/google-services.json';
    }
    return config.android?.googleServicesFile;
  })();

  const googleSignInPlugin = iosUrlScheme
    ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
    : '@react-native-google-signin/google-signin';

  return {
    ...config,
    android: {
      ...(config.android || {}),
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
      config: {
        ...(config.android?.config || {}),
        googleMaps: { apiKey: googleMapsApiKey },
      },
    },
    extra: {
      ...(config.extra || {}),
      hasAndroidGoogleServices,
      androidGoogleServices: {
        apiKey: androidGoogleClient?.api_key?.[0]?.current_key?.trim() ?? '',
        appId: androidGoogleClient?.client_info?.mobilesdk_app_id?.trim() ?? '',
        hasAndroidOauthClient: androidHasOauthClient,
        messagingSenderId: androidGoogleServicesJson?.project_info?.project_number?.trim() ?? '',
        packageName:
          androidGoogleClient?.client_info?.android_client_info?.package_name?.trim() ??
          androidPackageName,
        projectId: androidGoogleServicesJson?.project_info?.project_id?.trim() ?? '',
        storageBucket: androidGoogleServicesJson?.project_info?.storage_bucket?.trim() ?? '',
        webClientId: androidGoogleWebClientId,
      },
    },
    plugins: [...(config.plugins || []), googleSignInPlugin],
  };
};
