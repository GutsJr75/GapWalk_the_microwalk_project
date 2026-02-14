import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from './src/lib/db';
import { useAppStore } from './src/store';
import { preferencesRepo } from './src/lib/repositories/preferencesRepo';
import { scheduleSourceRepo } from './src/lib/repositories/scheduleSourceRepo';
import { getThemePalette } from './src/theme/palette';

// Screens
import { IntroScreen } from './src/screens/IntroScreen';
import { ScheduleSetupScreen } from './src/screens/ScheduleSetupScreen';
import { ManualScheduleScreen } from './src/screens/ManualScheduleScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { WalkingScreen } from './src/screens/WalkingScreen';
import { ScheduleOverviewScreen } from './src/screens/ScheduleOverviewScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Intro: undefined;
  ScheduleSetup: { manageMode?: boolean } | undefined;
  ManualSchedule: { manageMode?: boolean; importedFilename?: string } | undefined;
  Preferences: { skipScheduleSource?: boolean };
  Dashboard: undefined;
  Walking: { planId?: string };
   ScheduleOverview: undefined;
   Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { hasCompletedOnboarding, setHasCompletedOnboarding, setPreferences, setScheduleSource, themeMode } = useAppStore();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database
      await getDatabase();
      
      // Check if user has completed onboarding
      const prefsExist = await preferencesRepo.exists();
      const sourceExists = await scheduleSourceRepo.exists();
      
      if (prefsExist && sourceExists) {
        setHasCompletedOnboarding(true);
        
        // Load preferences and source into store
        const prefs = await preferencesRepo.get();
        const source = await scheduleSourceRepo.get();
        setPreferences(prefs);
        setScheduleSource(source);
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  };

  const palette = getThemePalette(themeMode);

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={hasCompletedOnboarding ? 'Dashboard' : 'Intro'}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bgApp },
              animation: 'slide_from_right',
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="Intro" component={IntroScreen} />
            <Stack.Screen name="ScheduleSetup" component={ScheduleSetupScreen} />
            <Stack.Screen name="ManualSchedule" component={ManualScheduleScreen} />
            <Stack.Screen name="Preferences" component={PreferencesScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Walking" component={WalkingScreen} />
            <Stack.Screen name="ScheduleOverview" component={ScheduleOverviewScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </>
  );
}

