import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { ActiveWalkSnapshot, NotificationTimerMode, WalkActionSource } from '../types';

type NativeWalkTrackingModule = {
  startSession(
    planId?: string | null,
    targetDurationMinutes?: number | null,
    startedFromNotification?: boolean,
    notificationTimerMode?: NotificationTimerMode,
  ): Promise<ActiveWalkSnapshot | null>;
  pauseSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null>;
  resumeSession(source: WalkActionSource): Promise<ActiveWalkSnapshot | null>;
  requestEndConfirmation(): Promise<ActiveWalkSnapshot | null>;
  confirmEndSession(): Promise<ActiveWalkSnapshot | null>;
  cancelEndConfirmation(): Promise<ActiveWalkSnapshot | null>;
  updateNotificationTimerMode(mode: NotificationTimerMode): Promise<ActiveWalkSnapshot | null>;
  getSnapshot(): Promise<ActiveWalkSnapshot | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

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
  }): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.startSession(
      options?.planId ?? null,
      options?.targetDurationMinutes ?? null,
      options?.startedFromNotification ?? false,
      options?.notificationTimerMode ?? 'smart',
    ));
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

  async getSnapshot(): Promise<ActiveWalkSnapshot | null> {
    if (!nativeModule) return null;
    return normalizeSnapshot(await nativeModule.getSnapshot());
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
};
