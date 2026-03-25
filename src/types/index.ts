// Core data types for GapWalk

export type ScheduleSourceType = 'ics' | 'manual' | 'google';

export interface ScheduleSource {
  type: ScheduleSourceType;
  filename?: string;
  lastImportedAt?: string;
  googleConnected?: boolean;
  googleAccessToken?: string;
  googleRefreshToken?: string;
}

export interface BusyEvent {
  id: string;
  title: string;
  start: string; // ISO string
  end: string; // ISO string
  source: ScheduleSourceType;
  isAllDay: boolean;
  createdAt: string;
}

export type WhenToNotify = 'now' | 'delay' | 'next_gap';
export type StrictnessMode = 'easygoing' | 'no_excuses';

export interface PreferredWalkingPeriod {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface Preferences {
  dailyTargetMinutes: number;
  bufferMinutes: number;
  notificationCountPerDay: number;
  notificationMinGapMinutes: number; // minimum time between reminders
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string; // "HH:mm"
  minWalkMinutes: number;
  gracePeriodMinutes: number; // delay before walk timer starts after notification
  whenToNotify: WhenToNotify; // notification timing strategy
  notifyDelayMinutes: number; // used when whenToNotify === 'delay'
  strictnessMode: StrictnessMode;
  stepGoalEnabled: boolean;
  stepGoal: number;
  preferredWalkingPeriodsEnabled: boolean;
  preferredWalkingPeriods: PreferredWalkingPeriod[];
}

export interface WalkSession {
  id: string;
  nudgePlanId?: string;
  start: string; // ISO string
  end: string; // ISO string
  activeSeconds: number;
  pausedSeconds: number;
  distanceMeters?: number;
  steps?: number;
  calories?: number;
  usedLocation: boolean;
  createdAt: string;
  // Research tracking fields
  pauseCount?: number;
  maxSpeedMps?: number;
  avgSpeedMps?: number;
  elevationGainMeters?: number;
  stepSource?: WalkStepSource;
  motionConfidence?: WalkMotionConfidence;
  sensorHealthAtStart?: SensorHealth;
  wasRecovered?: boolean;
  nudgeToStartLatencySeconds?: number;
}

export type WalkMotionState =
  | 'starting'
  | 'walking'
  | 'not_moving'
  | 'paused'
  | 'location_off';

export type WalkDisplayState =
  | 'calibrating'
  | 'walking'
  | 'not_moving'
  | 'paused'
  | 'location_off'
  | 'sensor_issue';

export type SensorHealth =
  | 'active'
  | 'stale'
  | 'unsupported'
  | 'denied';

export type WalkMotionConfidence = 'low' | 'medium' | 'high';

export type WalkStepSource = 'sensor' | 'gps_fallback' | 'none';

export type WalkActionSource =
  | 'screen'
  | 'notification'
  | 'auto_pause'
  | 'restore';

export type WalkPrompt = 'end_confirmation';

export type WalkDisplayCard = 'walkDuration' | 'steps' | 'distance' | 'calories' | 'speed' | 'goalProgress';
export type NotificationTimerMode = 'smart' | 'elapsed' | 'remaining';

export const ALL_WALK_DISPLAY_CARDS: WalkDisplayCard[] = [
  'walkDuration', 'steps', 'distance', 'calories', 'speed', 'goalProgress',
];

export const WALK_DISPLAY_CARD_LABELS: Record<WalkDisplayCard, string> = {
  walkDuration: 'Walk Duration',
  steps: 'Steps',
  distance: 'Distance',
  calories: 'Calories',
  speed: 'Speed',
  goalProgress: 'Goal Progress',
};

export const NOTIFICATION_TIMER_MODE_LABELS: Record<NotificationTimerMode, string> = {
  smart: 'Smart',
  elapsed: 'Minutes walked',
  remaining: 'Minutes left',
};

export interface ActiveWalkSnapshot {
  sessionId: string;
  planId?: string;
  targetDurationMinutes?: number | null;
  startedFromNotification?: boolean;
  notificationTimerMode?: NotificationTimerMode;
  distanceUnit?: 'km' | 'mi';
  startIso: string;
  sessionStartMs: number;
  totalPausedMs: number;
  pauseStartedAtMs?: number | null;
  elapsedSeconds: number;
  paused: boolean;
  motionState: WalkMotionState;
  displayState: WalkDisplayState;
  pedometerHealth: SensorHealth;
  locationHealth: SensorHealth;
  motionConfidence: WalkMotionConfidence;
  stepSource: WalkStepSource;
  statusReason?: string | null;
  prompt?: WalkPrompt;
  distanceMeters: number;
  steps: number;
  usedLocation: boolean;
  locationPermissionGranted: boolean;
  backgroundLocationGranted: boolean;
  activityPermissionGranted: boolean;
  hadWalkingSignal: boolean;
  lastActionSource?: WalkActionSource | null;
  warning?: string | null;
  lastMotionAtMs?: number | null;
  lastStepAtMs?: number | null;
  lastGpsMotionAtMs?: number | null;
  lastAccelMotionAtMs?: number | null;
  lastAcceptedLocationAtMs?: number | null;
}

export type NudgePlanStatus = 
  | 'planned' 
  | 'notified' 
  | 'started' 
  | 'completed' 
  | 'skipped' 
  | 'cancelled';

export interface NudgePlan {
  id: string;
  date: string; // "YYYY-MM-DD"
  gapStart: string; // ISO string
  gapEnd: string; // ISO string
  walkStart: string; // ISO string (gapStart + bufferMinutes)
  suggestedDurationMinutes: number;
  manualNotifyLeadMinutes?: number; // per-manual-plan reminder lead time in minutes
  notificationsEnabled?: boolean;
  status: NudgePlanStatus;
  reason?: string;
  createdAt: string;
}

export interface ManualScheduleEntry {
  id: string;
  title: string;
  dayOfWeek: number; // 0-6, Sunday=0
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isOneTime?: boolean;
  oneTimeDate?: string; // "YYYY-MM-DD" (required when isOneTime === true)
}

// Default preferences
export const DEFAULT_PREFERENCES: Preferences = {
  dailyTargetMinutes: 15,
  bufferMinutes: 2,
  notificationCountPerDay: 2,
  notificationMinGapMinutes: 60,
  quietHoursStart: '23:00',
  quietHoursEnd: '06:00',
  minWalkMinutes: 6,
  gracePeriodMinutes: 2,
  whenToNotify: 'delay',
  notifyDelayMinutes: 5,
  strictnessMode: 'easygoing',
  stepGoalEnabled: false,
  stepGoal: 1000,
  preferredWalkingPeriodsEnabled: false,
  preferredWalkingPeriods: [],
};
