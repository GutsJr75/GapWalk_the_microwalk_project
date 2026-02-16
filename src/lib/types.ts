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
};
