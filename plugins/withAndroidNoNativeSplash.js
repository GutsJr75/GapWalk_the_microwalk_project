const {
  withAndroidManifest,
  withAndroidStyles,
  withAppBuildGradle,
  withMainActivity,
} = require('expo/config-plugins');

const MAIN_ACTIVITY_NAMES = new Set([
  '.MainActivity',
  'MainActivity',
  'com.gapwalk.app.MainActivity',
]);

function setMainActivityTheme(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  const mainActivity = application?.activity?.find((activity) =>
    MAIN_ACTIVITY_NAMES.has(activity.$['android:name'])
  );

  if (mainActivity?.$) {
    mainActivity.$['android:theme'] = '@style/AppTheme';
  }

  return androidManifest;
}

function removeSplashImportsAndCalls(contents) {
  return contents
    .replace(/^\s*import expo\.modules\.splashscreen\.SplashScreenManager\s*\n/m, '')
    .replace(
      /^\s*import androidx\.core\.splashscreen\.SplashScreen\.Companion\.installSplashScreen\s*\n/m,
      ''
    )
    .replace(/^\s*installSplashScreen\(\)\s*\n/m, '')
    .replace(
      /\s*\/\/ @generated begin expo-splashscreen[\s\S]*?\/\/ @generated end expo-splashscreen\s*\n/m,
      ''
    )
    .replace(/\n{3,}/g, '\n\n');
}

function removeSplashTheme(styles) {
  styles.resources.style =
    styles.resources.style?.filter(({ $ }) => $?.name !== 'Theme.App.SplashScreen') ?? [];
  return styles;
}

function removeSplashDependency(contents) {
  return contents
    .replace(
      /\n\s*\/\/ Required for Theme\.SplashScreen → AppCompat theme transition in MainActivity\n\s*implementation\("androidx\.core:core-splashscreen:[^"]+"\)\n/,
      '\n'
    )
    .replace(/\n{3,}/g, '\n\n');
}

module.exports = function withAndroidNoNativeSplash(config) {
  config = withAndroidManifest(config, (config) => {
    config.modResults = setMainActivityTheme(config.modResults);
    return config;
  });

  config = withMainActivity(config, (config) => {
    config.modResults.contents = removeSplashImportsAndCalls(config.modResults.contents);
    return config;
  });

  config = withAndroidStyles(config, (config) => {
    config.modResults = removeSplashTheme(config.modResults);
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = removeSplashDependency(config.modResults.contents);
    return config;
  });

  return config;
};
