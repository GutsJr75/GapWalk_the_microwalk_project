import { create } from 'zustand';
import { Preferences, ScheduleSource, NudgePlan, WalkSession } from '../lib/types';

interface AppState {
  // Onboarding state
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
  
  // Schedule source
  scheduleSource: ScheduleSource | null;
  setScheduleSource: (source: ScheduleSource | null) => void;
  
  // Preferences
  preferences: Preferences | null;
  setPreferences: (prefs: Preferences | null) => void;
  hasSetPreferences: boolean;
  setHasSetPreferences: (value: boolean) => void;
  
  // Dashboard stats
  todayMinutesWalked: number;
  todayNotificationCount: number;
  todaySteps: number;
  upcomingPlans: NudgePlan[];
  setTodayStats: (minutes: number, notifCount: number, steps?: number) => void;
  setTodaySteps: (steps: number) => void;
  setUpcomingPlans: (plans: NudgePlan[]) => void;
  
  // Active walk session
  activeWalkSession: WalkSession | null;
  setActiveWalkSession: (session: WalkSession | null) => void;
  
  // Location permission
  hasLocationPermission: boolean;
  setHasLocationPermission: (value: boolean) => void;
  
  // Notification permission
  hasNotificationPermission: boolean;
  setHasNotificationPermission: (value: boolean) => void;

  // Activity Recognition / Pedometer permission
  hasActivityPermission: boolean;
  setHasActivityPermission: (value: boolean) => void;

  // Whether initial permissions have been requested
  hasRequestedPermissions: boolean;
  setHasRequestedPermissions: (value: boolean) => void;
  
  // UI settings
  themeMode: 'dark' | 'light';
  setThemeMode: (mode: 'dark' | 'light') => void;
  language: 'en' | 'es';
  setLanguage: (lang: 'en' | 'es') => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Onboarding
  hasCompletedOnboarding: false,
  setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
  
  // Schedule source
  scheduleSource: null,
  setScheduleSource: (source) => set({ scheduleSource: source }),
  
  // Preferences
  preferences: null,
  setPreferences: (prefs) => set({ preferences: prefs }),
  hasSetPreferences: false,
  setHasSetPreferences: (value) => set({ hasSetPreferences: value }),
  
  // Dashboard stats
  todayMinutesWalked: 0,
  todayNotificationCount: 0,
  todaySteps: 0,
  upcomingPlans: [],
  setTodayStats: (minutes, notifCount, steps) => 
    set((state) => ({
      todayMinutesWalked: minutes,
      todayNotificationCount: notifCount,
      todaySteps: steps !== undefined ? steps : state.todaySteps,
    })),
  setTodaySteps: (steps) => set({ todaySteps: steps }),
  setUpcomingPlans: (plans) => set({ upcomingPlans: plans }),
  
  // Active walk
  activeWalkSession: null,
  setActiveWalkSession: (session) => set({ activeWalkSession: session }),
  
  // Permissions
  hasLocationPermission: false,
  setHasLocationPermission: (value) => set({ hasLocationPermission: value }),
  hasNotificationPermission: false,
  setHasNotificationPermission: (value) => set({ hasNotificationPermission: value }),
  hasActivityPermission: false,
  setHasActivityPermission: (value) => set({ hasActivityPermission: value }),
  hasRequestedPermissions: false,
  setHasRequestedPermissions: (value) => set({ hasRequestedPermissions: value }),
  
  // UI settings
  themeMode: 'dark',
  setThemeMode: (mode) => set({ themeMode: mode }),
  language: 'en',
  setLanguage: (lang) => set({ language: lang }),
}));
