import { plansRepo } from '../data/repositories/plansRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { analyticsService } from './analytics';
import { isNotificationsSupported, notificationService } from './notifications';
import { runBackendSync } from './backendSync';
import { NudgePlan, SensorHealth, WalkMotionConfidence, WalkSession, WalkStepSource } from '../types';

export interface AndroidCompletedSessionPayload {
  sessionId: string;
  planId?: string;
  startIso: string;
  endIso: string;
  activeSeconds: number;
  pausedSeconds: number;
  distanceMeters: number;
  steps: number;
  usedLocation: boolean;
  stepSource: WalkStepSource;
  motionConfidence: WalkMotionConfidence;
  sensorHealthAtStart: SensorHealth;
  hadWalkingSignal: boolean;
  distanceUnit: 'km' | 'mi';
}

export interface BuildAndroidWalkSessionOptions {
  pauseCount?: number;
  fallbackPlanId?: string;
  plan?: Pick<NudgePlan, 'id' | 'walkStart'> | null;
}

export interface PersistCompletedWalkSessionOptions {
  planStatus?: 'completed' | 'cancelled' | 'skipped';
  endReason?: 'manual' | 'idle_later';
  hadWalkingSignal?: boolean;
}

export const buildWalkSessionFromAndroidCompletion = (
  payload: AndroidCompletedSessionPayload,
  options?: BuildAndroidWalkSessionOptions,
): WalkSession => {
  const resolvedPlanId = payload.planId || options?.fallbackPlanId;
  let nudgeToStartLatencySeconds: number | undefined;

  if (options?.plan?.walkStart) {
    const latencyMs =
      new Date(payload.startIso).getTime() - new Date(options.plan.walkStart).getTime();
    if (latencyMs >= 0) {
      nudgeToStartLatencySeconds = Math.round(latencyMs / 1000);
    }
  }

  return {
    id: payload.sessionId,
    nudgePlanId: resolvedPlanId || undefined,
    start: payload.startIso,
    end: payload.endIso,
    activeSeconds: payload.activeSeconds,
    pausedSeconds: payload.pausedSeconds,
    distanceMeters: payload.distanceMeters,
    steps: payload.steps,
    usedLocation: payload.usedLocation,
    createdAt: new Date().toISOString(),
    stepSource: payload.stepSource,
    motionConfidence: payload.motionConfidence,
    sensorHealthAtStart: payload.sensorHealthAtStart,
    pauseCount: options?.pauseCount,
    nudgeToStartLatencySeconds,
  };
};

export const persistCompletedWalkSession = async (
  session: WalkSession,
  options?: PersistCompletedWalkSessionOptions,
): Promise<WalkSession> => {
  const shouldResolveMatchingPlan =
    !session.nudgePlanId && (options?.planStatus ?? 'completed') === 'completed';
  const matchedPlan = shouldResolveMatchingPlan
    ? await plansRepo.findBestMatchingPlanForSession(session)
    : null;
  const resolvedSession = matchedPlan
    ? { ...session, nudgePlanId: matchedPlan.id }
    : session;

  await sessionsRepo.save(resolvedSession);
  if (resolvedSession.nudgePlanId) {
    await plansRepo.updateStatus(
      resolvedSession.nudgePlanId,
      options?.planStatus ?? 'completed',
    );
    if (isNotificationsSupported) {
      await notificationService.clearPlanNotifications(resolvedSession.nudgePlanId);
    }
  }

  void runBackendSync();

  analyticsService.track('walk_completed', {
    planId: resolvedSession.nudgePlanId || null,
    activeSeconds: resolvedSession.activeSeconds,
    pausedSeconds: resolvedSession.pausedSeconds,
    distanceMeters: Math.round(resolvedSession.distanceMeters ?? 0),
    steps: resolvedSession.steps ?? 0,
    usedLocation: resolvedSession.usedLocation,
    hadWalkingSignal: options?.hadWalkingSignal ?? false,
    endReason: options?.endReason ?? 'manual',
  });

  return resolvedSession;
};
