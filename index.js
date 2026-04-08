import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';
import { enableFreeze } from 'react-native-screens';
import App from './App';

// Screen freezing can cause white-frame flashes during Android back transitions.
// Keep freeze enabled on iOS for perf, disable on Android for smoother pops.
enableFreeze(Platform.OS !== 'android');

registerRootComponent(App);

// Register the headless JS task for Android exact-alarm notification actions.
// This allows Yes / Not Now button taps on walk_ready notifications to be
// handled in the background without foregrounding the app.
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(
    'ExactNotificationActionTask',
    () => require('./src/services/exactNotificationActionTask').default,
  );
  AppRegistry.registerHeadlessTask(
    'ExactNotificationRecoveryTask',
    () => require('./src/services/exactNotificationRecoveryTask').default,
  );
}
