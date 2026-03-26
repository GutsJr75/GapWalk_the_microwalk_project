import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  ActiveWalkSnapshot,
  EndWalkMode,
  NotificationStatsMode,
  NotificationTimerMode,
  WalkActionSource,
} from '../types';

type NativeWalkTrackingModule = {
  startSession(
    planId?: string | null,
    targetDurationMinutes?: number | null,
    startedFromNotification?: boolean,
    notificationTimerMode?: NotificationTimerMode,
    notificationStatsMode?: NotificationStatsMode,
    distanceUnit?: 'km' | 'mi',
  ): Promise<ActiveWalkSnapshot | null>;
  pauseSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null>;
  resumeSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null>;
  requestEndConfirmation(): Promise<ActiveWalkSnapshot | null>;
  confirmEndSession(): Promise<ActiveWalkSnapshot | null>;
  cancelEndConfirmation(): Promise<ActiveWalkSnapshot | null>;
  updateNotificationTimerMode(mode: NotificationTimerMode): Promise<ActiveWalkSnapshot | null>;
  updateNotificationStatsMode(mode: NotificationStatsMode): Promise<ActiveWalkSnapshot | null>;
  setEndWalkMode(mode: string): Promise<boolean>;
  getSnapshot(): Promise<ActiveWalkSnapshot | null>;
  consumePendingQuickEndCompletion(): Promise<AndroidQuickEndPayload | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export interface AndroidQuickEndPayload {
  sessionId: string;
  planId?: string;
  startIso: string;
  endIso: string;
  activeSeconds: number;
  pausedSeconds: number;
  steps: number;
  distanceMeters: number;
  usedLocation: boolean;
  stepSource: 'sensor' | 'gps_fallback' | 'none';
  motionConfidence: 'low' | 'medium' | 'high';
  sensorHealthAtStart: 'active' | 'stale' | 'unsupported' | 'denied';
  hadWalkingSignal: boolean;
  distanceUnit: 'km' | 'mi';
}

const nativeModule = NativeModules.WalkTracking as NativeWalkTrackingModule | undefined;
const nativeEmitter =
  Platform.OS === 'android' && nativeModule
    ? new NativeEventEmitter(nativeModule as never)
    : null;

const normalizeSnapshot = (value: ActiveWalkSnapshot | null | undefined): ActiveWalkSnapshot | null => {
  if (!value) return null;
  return {
    ...value,
    planId: value.planId || undefined,
    targetDurationMinutes: value.targetDurationMinutes ?? null,
    startedFromNotification: !!value.startedFromNotification,
    notificationTimerMode: (value.notificationTimerMode as NotificationTimerMode | undefined) ?? 'smart',
    notificationStatsMode: (value.notificationStatsMode as NotificationStatsMode | undefined) ?? 'all',
    distanceUnit: value.distanceUnit === 'mi' ? 'mi' : 'km',
    pauseStartedAtMs: value.pauseStartedAtMs ?? null,
    displayState: value.displayState ?? (value.paused ? 'paused' : 'calibrating'),
    pedometerHealth: value.pedometerHealth ?? 'stale',
    locationHealth: value.locationHealth ?? 'stale',
    motionConfidence: value.motionConfidence ?? 'low',
    stepSource: value.stepSource ?? 'none',
    prompt: value.prompt || undefined,
    warning: value.warning ?? null,
    statusReason: value.statusReason ?? null,
    lastActionSource: value.lastActionSource ?? null,
    lastMotionAtMs: value.lastMotionAtMs ?? null,
    lastStepAtMs: value.lastStepAtMs ?? null,
    lastGpsMotionAtMs: value.lastGpsMotionAtMs ?? null,
    lastAccelMotionAtMs: value.lastAccelMotionAtMs ?? null,
    lastAcceptedLocationAtMs: value.lastAcceptedLocationAtMs ?? null,
  };
};

export const androidWalkTracking = {
  isSupported(): boolean {
    return Platform.OS === 'android' && !!nativeModule;
  },

  async startSession(options?: {
    planId?: string;
    targetDurationMinutes?: number | null;
    startedFromNotification?: boolean;
    notificationTimerMode?: NotificationTimerMode;
    notificationStatsMode?: NotificationStatsMode;
    distanceUnit?: 'km' | 'mi';
  }): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    const planId = options?.planId ?? null;
    const targetDurationMinutes = options?.targetDurationMinutes ?? null;
    const startedFromNotification = options?.startedFromNotification ?? false;
    const notificationTimerMode = options?.notificationTimerMode ?? 'smart';
    const notificationStatsMode = options?.notificationStatsMode ?? 'all';
    const distanceUnit = options?.distanceUnit === 'mi' ? 'mi' : 'km';

    try {
      return normalizeSnapshot(await nativeModule.startSession(
        planId,
        targetDurationMinutes,
        startedFromNotification,
        notificationTimerMode,
        notificationStatsMode,
        distanceUnit,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const argCountMismatch =
        message.includes('called with') &&
        message.includes('expected argument count:');
      if (!argCountMismatch) throw error;

      try {
        return normalizeSnapshot(await (nativeModule.startSession as unknown as (
          planId?: string | null,
          targetDurationMinutes?: number | null,
          startedFromNotification?: boolean,
          notificationTimerMode?: NotificationTimerMode,
          distanceUnit?: 'km' | 'mi'
        ) => Promise<ActiveWalkSnapshot | null>)(
          planId,
          targetDurationMinutes,
          startedFromNotification,
          notificationTimerMode,
          distanceUnit,
        ));
      } catch (fallbackError) {
        return normalizeSnapshot(await (nativeModule.startSession as unknown as (
          planId?: string | null,
          targetDurationMinutes?: number | null,
          startedFromNotification?: boolean,
          notificationTimerMode?: NotificationTimerMode
        ) => Promise<ActiveWalkSnapshot | null>)(
          planId,
          targetDurationMinutes,
          startedFromNotification,
          notificationTimerMode,
        ));
      }
    }
  },

  async pauseSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.pauseSession(source));
  },

  async resumeSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.resumeSession(source));
  },

  async requestEndConfirmation(): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.requestEndConfirmation());
  },

  async confirmEndSession(): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.confirmEndSession());
  },

  async cancelEndConfirmation(): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.cancelEndConfirmation());
  },

  async updateNotificationTimerMode(mode: NotificationTimerMode): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.updateNotificationTimerMode(mode));
  },

  async updateNotificationStatsMode(mode: NotificationStatsMode): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule?.updateNotificationStatsMode) return null;
    return normalizeSnapshot(await nativeModule.updateNotificationStatsMode(mode));
  },

  async getSnapshot(): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.getSnapshot());
  },

  async setEndWalkMode(mode: EndWalkMode): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setEndWalkMode(mode);
  },

  async consumePendingQuickEndCompletion(): Promise<AndroidQuickEndPayload | null> {
    if (!nativeModule || typeof nativeModule.consumePendingQuickEndCompletion !== 'function') {
      return null;
    }
    const payload = await nativeModule.consumePendingQuickEndCompletion();
    if (!payload?.sessionId) return null;
    return {
      sessionId: payload.sessionId,
      planId: payload.planId || undefined,
      startIso: payload.startIso,
      endIso: payload.endIso,
      activeSeconds: payload.activeSeconds ?? 0,
      pausedSeconds: payload.pausedSeconds ?? 0,
      steps: payload.steps ?? 0,
      distanceMeters: payload.distanceMeters ?? 0,
      usedLocation: !!payload.usedLocation,
      stepSource: payload.stepSource === 'gps_fallback'
        ? 'gps_fallback'
        : payload.stepSource === 'sensor'
          ? 'sensor'
          : 'none',
      motionConfidence: payload.motionConfidence === 'high'
        ? 'high'
        : payload.motionConfidence === 'medium'
          ? 'medium'
          : 'low',
      sensorHealthAtStart: payload.sensorHealthAtStart === 'active'
        ? 'active'
        : payload.sensorHealthAtStart === 'unsupported'
          ? 'unsupported'
          : payload.sensorHealthAtStart === 'denied'
            ? 'denied'
            : 'stale',
      hadWalkingSignal: !!payload.hadWalkingSignal,
      distanceUnit: payload.distanceUnit === 'km' ? 'km' : 'mi',
    };
  },

  subscribe(listener: (snapshot: ActiveWalkSnapshot | null) => void): { remove: () => void } {
    if (!nativeEmitter) {
      return { remove: () => undefined };
    }

    const subscription = nativeEmitter.addListener('walkSessionUpdated', (payload: ActiveWalkSnapshot | null) => {
      listener(normalizeSnapshot(payload));
    });

    return {
      remove: () => subscription.remove(),
    };
  },

  subscribeToQuickEnd(
    listener: (payload: AndroidQuickEndPayload) => void,
  ): { remove: () => void } {
    if (!nativeEmitter) {
      return { remove: () => undefined };
    }

    const subscription = nativeEmitter.addListener(
      'walkQuickEndCompleted',
      (payload: Partial<AndroidQuickEndPayload> | null) => {
        if (!payload?.sessionId) return;
        listener({
          sessionId: payload.sessionId,
          planId: payload.planId || undefined,
          startIso: payload.startIso ?? new Date().toISOString(),
          endIso: payload.endIso ?? new Date().toISOString(),
          activeSeconds: payload.activeSeconds ?? 0,
          pausedSeconds: payload.pausedSeconds ?? 0,
          steps: payload.steps ?? 0,
          distanceMeters: payload.distanceMeters ?? 0,
          usedLocation: !!payload.usedLocation,
          stepSource: payload.stepSource === 'gps_fallback'
            ? 'gps_fallback'
            : payload.stepSource === 'sensor'
              ? 'sensor'
              : 'none',
          motionConfidence: payload.motionConfidence === 'high'
            ? 'high'
            : payload.motionConfidence === 'medium'
              ? 'medium'
              : 'low',
          sensorHealthAtStart: payload.sensorHealthAtStart === 'active'
            ? 'active'
            : payload.sensorHealthAtStart === 'unsupported'
              ? 'unsupported'
              : payload.sensorHealthAtStart === 'denied'
                ? 'denied'
                : 'stale',
          hadWalkingSignal: !!payload.hadWalkingSignal,
          distanceUnit: payload.distanceUnit === 'km' ? 'km' : 'mi',
        });
      },
    );

    return {
      remove: () => subscription.remove(),
    };
  },
};
