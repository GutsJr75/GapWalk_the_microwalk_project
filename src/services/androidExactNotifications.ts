import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type ExactNotificationType = 'walk_nudge' | 'walk_missed';

export interface ExactNotificationScheduleInput {
  notificationId: string;
  planId: string;
  type: ExactNotificationType;
  title: string;
  body: string;
  scheduledAtMs: number;
}

export interface ExactNotificationResponsePayload {
  notificationId: string;
  planId?: string;
  type?: ExactNotificationType;
  actionIdentifier: string;
}

export interface ExactNotificationDeliveryPayload {
  notificationId: string;
  planId?: string;
  type?: ExactNotificationType;
}

type NativeExactNotificationsModule = {
  canScheduleExactAlarms(): Promise<boolean>;
  setReminderVibrationEnabled(enabled: boolean): Promise<void>;
  scheduleNotification(input: ExactNotificationScheduleInput): Promise<boolean>;
  cancelNotification(notificationId: string): Promise<void>;
  dismissNotification(notificationId: string): Promise<void>;
  cancelAllPlanNotifications(): Promise<void>;
  consumePendingResponse(): Promise<ExactNotificationResponsePayload | null>;
  consumePendingDeliveries(): Promise<ExactNotificationDeliveryPayload[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const RESPONSE_EVENT_NAME = 'exactNotificationResponse';
const DELIVERY_EVENT_NAME = 'exactNotificationDelivered';

const nativeModule = NativeModules.ExactAlarmNotifications as
  | NativeExactNotificationsModule
  | undefined;

const nativeEmitter =
  Platform.OS === 'android' && nativeModule
    ? new NativeEventEmitter(nativeModule as never)
    : null;

const normalizeResponse = (
  value: ExactNotificationResponsePayload | null | undefined,
): ExactNotificationResponsePayload | null => {
  if (!value?.notificationId) return null;
  return {
    notificationId: value.notificationId,
    planId: value.planId || undefined,
    type:
      value.type === 'walk_missed' || value.type === 'walk_nudge'
        ? value.type
        : undefined,
    actionIdentifier: value.actionIdentifier,
  };
};

const normalizeDelivery = (
  value: ExactNotificationDeliveryPayload | null | undefined,
): ExactNotificationDeliveryPayload | null => {
  if (!value?.notificationId) return null;
  return {
    notificationId: value.notificationId,
    planId: value.planId || undefined,
    type:
      value.type === 'walk_missed' || value.type === 'walk_nudge'
        ? value.type
        : undefined,
  };
};

export const androidExactNotifications = {
  isSupported(): boolean {
    return Platform.OS === 'android' && !!nativeModule;
  },

  async canScheduleExactAlarms(): Promise<boolean> {
    if (!nativeModule) return false;
    try {
      return await nativeModule.canScheduleExactAlarms();
    } catch {
      return false;
    }
  },

  async setReminderVibrationEnabled(enabled: boolean): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setReminderVibrationEnabled(enabled);
  },

  async scheduleNotification(input: ExactNotificationScheduleInput): Promise<boolean> {
    if (!nativeModule) return false;
    return nativeModule.scheduleNotification(input);
  },

  async cancelNotification(notificationId: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.cancelNotification(notificationId);
  },

  async dismissNotification(notificationId: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.dismissNotification(notificationId);
  },

  async cancelAllPlanNotifications(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.cancelAllPlanNotifications();
  },

  async consumePendingResponse(): Promise<ExactNotificationResponsePayload | null> {
    if (!nativeModule) return null;
    return normalizeResponse(await nativeModule.consumePendingResponse());
  },

  async consumePendingDeliveries(): Promise<ExactNotificationDeliveryPayload[]> {
    if (!nativeModule || typeof nativeModule.consumePendingDeliveries !== 'function') return [];
    const payloads = await nativeModule.consumePendingDeliveries();
    return Array.isArray(payloads)
      ? payloads
          .map((payload) => normalizeDelivery(payload))
          .filter((payload): payload is ExactNotificationDeliveryPayload => payload !== null)
      : [];
  },

  subscribe(
    listener: (payload: ExactNotificationResponsePayload) => void,
  ): { remove: () => void } {
    if (!nativeEmitter) {
      return { remove: () => undefined };
    }

    const subscription = nativeEmitter.addListener(
      RESPONSE_EVENT_NAME,
      (payload: ExactNotificationResponsePayload | null) => {
        const normalized = normalizeResponse(payload);
        if (normalized) {
          listener(normalized);
        }
      },
    );

    return {
      remove: () => subscription.remove(),
    };
  },

  subscribeToDelivery(
    listener: (payload: ExactNotificationDeliveryPayload) => void,
  ): { remove: () => void } {
    if (!nativeEmitter) {
      return { remove: () => undefined };
    }

    const subscription = nativeEmitter.addListener(
      DELIVERY_EVENT_NAME,
      (payload: ExactNotificationDeliveryPayload | null) => {
        const normalized = normalizeDelivery(payload);
        if (normalized) {
          listener(normalized);
        }
      },
    );

    return {
      remove: () => subscription.remove(),
    };
  },
};
