import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, Easing, Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { NudgePlan, WalkSession } from '../lib/types';
import { plansRepo } from '../lib/repositories/plansRepo';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { analyticsService } from '../lib/analytics';
import { isNotificationsSupported, notificationService, WALK_SESSION_ACTION_PAUSE, WALK_SESSION_ACTION_RESUME, WALK_SESSION_ACTION_END } from '../lib/notifications';
import { saveWalkCheckpoint, clearWalkCheckpoint } from '../lib/walkCheckpoint';
import { useAppStore } from '../store';

/**
 * Error boundary to catch native map crashes (e.g. missing Google Maps API key)
 * and fall back gracefully instead of killing the app.
 */
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.warn('Map failed to render:', error.message);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;

interface Coord {
  latitude: number;
  longitude: number;
}

interface PathPoint {
  coord: Coord;
  timestampMs: number;
}

const DEFAULT_COORD: Coord = { latitude: 37.7749, longitude: -122.4194 };
const STRIDE_METERS = 0.78;
const WALKING_SPEED_THRESHOLD_MPS = 0.65;
const MIN_SEGMENT_METERS = 0.35;
const MAX_VALID_JUMP_METERS = 80;
const INACTIVITY_PAUSE_SECONDS = 30;

// Map is disabled until a Google Maps API key is configured.
// Tracking (distance, steps, timer) works without the map.
let MapViewImpl: any = null;
let MarkerImpl: any = null;
let PolylineImpl: any = null;
let PROVIDER_GOOGLE_IMPL: any = null;

const DARK_MAP_STYLE: Array<Record<string, unknown>> = [
  { elementType: 'geometry', stylers: [{ color: '#1b2230' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6f7b93' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b2230' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5a657d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3345' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#20293a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1728' }] },
];

const formatClock = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = String(clamped % 60).padStart(2, '0');
  return `${mins} min ${secs} sec`;
};

const formatMiles = (distanceMeters: number): string => `${(distanceMeters / 1609.34).toFixed(2)} mi`;

const haversineMeters = (a: Coord, b: Coord): number => {
  const R = 6371e3;
  const p1 = (a.latitude * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dPhi = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLambda = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(dPhi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export const WalkingScreen: React.FC<Props> = ({ navigation, route }) => {
  const planId = route.params?.planId;
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();
  const { preferences, themeMode } = useAppStore();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [paused, setPaused] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [steps, setSteps] = useState(0);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [hadWalkingSignal, setHadWalkingSignal] = useState(false);
  const [currentCoord, setCurrentCoord] = useState<Coord | null>(null);
  const [mapError, setMapError] = useState(false);
  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);

  const startIsoRef = useRef(new Date().toISOString());
  const sessionIdRef = useRef(`s-${Date.now()}`);
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPointRef = useRef<PathPoint | null>(null);
  const lastMovementAtRef = useRef<number>(Date.now());
  const mapRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  // Timestamp-based timer tracking (survives background transitions)
  const sessionStartMsRef = useRef(Date.now());
  const totalPausedMsRef = useRef(0);
  const lastLocationUpdateMsRef = useRef(Date.now());
  const hasInitialLocationRef = useRef(false);
  const notifActionRef = useRef<(actionId: string) => void>(() => {});
  // Refs mirroring state so the setInterval checkpoint can read them synchronously
  const distanceRef = useRef(0);
  const stepsRef = useRef(0);
  const isTrackingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const sessionFinalizedRef = useRef(false);
  const checkpointWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const allowLeaveRef = useRef(false);

  const completionPopAnim = useRef(new Animated.Value(0)).current;
  const completionBurstAnim = useRef(new Animated.Value(0)).current;
  const completionConfettiAnim = useRef(new Animated.Value(0)).current;
  const sheetExpandAnim = useRef(new Animated.Value(1)).current; // 1=expanded, 0=collapsed

  // Pedometer state
  const [usePedometer, setUsePedometer] = useState(false);
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const pedometerBaseStepsRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<Date>(new Date());
  const pedometerAvailableRef = useRef(false);
  // Tracks the last raw watchStepCount value so we can detect resubscription resets
  const lastWatchStepsRef = useRef<number>(0);
  // Steps accumulated from previous watch subscriptions (before resubscription resets counter)
  const accumulatedStepsRef = useRef<number>(0);
  // Steps accumulated before a pause (frozen while paused)
  const stepsAtPauseRef = useRef<number>(0);
  // Whether pedometer has delivered at least one step event
  const pedometerHasDeliveredRef = useRef(false);
  // Time since pedometer was initialized - used to fall back to GPS if no events
  const pedometerInitTimeRef = useRef<number>(0);
  // Watchdog: if step events stall, resubscribe.
  const lastPedometerResubscribeAtRef = useRef<number>(0);

  /** Compute active walking seconds from timestamps (works across background). */
  const computeElapsedSeconds = useCallback(() => {
    const now = Date.now();
    const currentPauseMs = pauseStartedAtRef.current ? (now - pauseStartedAtRef.current) : 0;
    return Math.max(0, Math.floor(
      (now - sessionStartMsRef.current - totalPausedMsRef.current - currentPauseMs) / 1000
    ));
  }, []);

  const queueCheckpointSave = useCallback(async () => {
    if (sessionFinalizedRef.current) return;

    const currentPauseMs = pauseStartedAtRef.current
      ? (Date.now() - pauseStartedAtRef.current)
      : 0;

    const nextWrite = checkpointWriteChainRef.current
      .catch(() => undefined)
      .then(() => saveWalkCheckpoint({
        sessionId: sessionIdRef.current,
        planId: planId ?? undefined,
        startIso: startIsoRef.current,
        sessionStartMs: sessionStartMsRef.current,
        totalPausedMs: totalPausedMsRef.current + currentPauseMs,
        distanceMeters: distanceRef.current,
        steps: stepsRef.current,
        paused: pausedRef.current,
        usedLocation: isTrackingRef.current && !permissionDeniedRef.current,
      }));

    checkpointWriteChainRef.current = nextWrite;
    await nextWrite;
  }, [planId]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => { distanceRef.current = distanceMeters; }, [distanceMeters]);
  useEffect(() => { stepsRef.current = steps; }, [steps]);
  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
  useEffect(() => { permissionDeniedRef.current = permissionDenied; }, [permissionDenied]);

  // With location disabled, estimate distance from steps.
  useEffect(() => {
    if (!usePedometer) return;
    setDistanceMeters(steps * STRIDE_METERS);
  }, [steps, usePedometer]);

  const applyLocationPoint = useCallback((location: Location.LocationObject) => {
    const nextCoord: Coord = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    const nextTimestamp = typeof location.timestamp === 'number' ? location.timestamp : Date.now();
    const previous = lastPointRef.current;

    setCurrentCoord(nextCoord);

    if (!pausedRef.current) {
      setRouteCoords((prev) => {
        const next = [...prev, nextCoord];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    }

    if (previous) {
      const segmentMeters = haversineMeters(previous.coord, nextCoord);
      const dtSeconds = Math.max(1, Math.round((nextTimestamp - previous.timestampMs) / 1000));
      const speedFromSensor = typeof location.coords.speed === 'number' && location.coords.speed >= 0
        ? location.coords.speed
        : null;
      const estimatedSpeed = segmentMeters / dtSeconds;
      const effectiveSpeed = speedFromSensor ?? estimatedSpeed;
      const moving = !pausedRef.current && effectiveSpeed >= WALKING_SPEED_THRESHOLD_MPS;

      setIsWalking(moving);
      if (moving) {
        setHadWalkingSignal(true);
        lastMovementAtRef.current = Date.now();
      }

      if (!pausedRef.current && segmentMeters >= MIN_SEGMENT_METERS && segmentMeters <= MAX_VALID_JUMP_METERS) {
        setDistanceMeters((prevDistance) => prevDistance + segmentMeters);
      }
    }

    lastPointRef.current = { coord: nextCoord, timestampMs: nextTimestamp };
  }, []);

  // Location is not used for now (no map support). Steps come from pedometer only.
  const requestPermissionAndTrack = useCallback(async () => {
    // No-op: we don't request or use location. Timer and step count work without it.
  }, []);

  const resubscribePedometer = useCallback(() => {
    if (!pedometerAvailableRef.current) return;
    if (pedometerSubscriptionRef.current) {
      // Preserve accumulated steps before resetting the watch subscription counter.
      accumulatedStepsRef.current += lastWatchStepsRef.current;
      lastWatchStepsRef.current = 0;
      pedometerSubscriptionRef.current.remove();
    }

    const sub = Pedometer.watchStepCount((result) => {
      if (!isMountedRef.current) return;
      pedometerHasDeliveredRef.current = true;
      if (!pausedRef.current) {
        const totalSteps = accumulatedStepsRef.current + result.steps;
        lastWatchStepsRef.current = result.steps;
        setSteps(totalSteps);
        lastMovementAtRef.current = Date.now();
        setHadWalkingSignal(true);
      }
    });
    pedometerSubscriptionRef.current = sub;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    sessionFinalizedRef.current = false;
    checkpointWriteChainRef.current = Promise.resolve();
    sessionStartTimeRef.current = new Date();
    sessionStartMsRef.current = Date.now();
    totalPausedMsRef.current = 0;
    void queueCheckpointSave();
    void (async () => {
      if (planId) {
        const found = await plansRepo.getById(planId);
        if (found && isMountedRef.current) {
          setPlan(found);
          await plansRepo.updateStatus(planId, 'started');
        }
      }
      await requestPermissionAndTrack();

      // Initialize pedometer for real step counting
      try {
        const pedometerAvailable = await Pedometer.isAvailableAsync();
        if (pedometerAvailable && isMountedRef.current) {
          const { status } = await Pedometer.getPermissionsAsync();
          let permGranted = status === 'granted';
          if (!permGranted) {
            const { status: newStatus } = await Pedometer.requestPermissionsAsync();
            permGranted = newStatus === 'granted';
          }

          if (permGranted && isMountedRef.current) {
            pedometerAvailableRef.current = true;
            pedometerInitTimeRef.current = Date.now();
            lastWatchStepsRef.current = 0;
            accumulatedStepsRef.current = 0;
            setUsePedometer(true); // Use pedometer for steps so we don't overwrite with 0 from distance

            // Use watchStepCount for real-time step counting.
            const subscription = Pedometer.watchStepCount((result) => {
              if (!isMountedRef.current) return;
              pedometerHasDeliveredRef.current = true;

              if (!pausedRef.current) {
                // result.steps is cumulative since this subscription started.
                // Track the total = accumulated from prior subs + current sub's value.
                const totalSteps = accumulatedStepsRef.current + result.steps;
                lastWatchStepsRef.current = result.steps;
                setSteps(totalSteps);
                // If steps are being counted, user is walking
                lastMovementAtRef.current = Date.now();
                setHadWalkingSignal(true);
              }
            });
            pedometerSubscriptionRef.current = subscription;
          }
        }
      } catch (e) {
        console.warn('Pedometer initialization failed:', e);
        setUsePedometer(false);
        pedometerAvailableRef.current = false;
      }
      // Set up walk session notification
      if (isNotificationsSupported) {
        await notificationService.setupWalkSessionCategories();
        void notificationService.showWalkSessionNotification(formatClock(0), false);
      }
    })();

    // Timestamp-based timer: computes elapsed from session start (works across background)
    let notifCounter = 0;
    timerRef.current = setInterval(() => {
      if (sessionFinalizedRef.current) return;

      setTicks((prev) => prev + 1);
      const elapsed = computeElapsedSeconds();
      if (!pausedRef.current) {
        setActiveSeconds(elapsed);
      }
      // Derive "walking now" from recent step events.
      const movingRecently = !pausedRef.current && (Date.now() - lastMovementAtRef.current) < 2500;
      setIsWalking((prev) => (prev === movingRecently ? prev : movingRecently));

      // Update walk session notification every second (live timer)
      notifCounter++;
      if (isNotificationsSupported) {
        void notificationService.showWalkSessionNotification(formatClock(elapsed), pausedRef.current);
      }
      // Auto-save walk checkpoint every 30 seconds (crash/kill recovery)
      if (notifCounter % 30 === 0) {
        void queueCheckpointSave();
      }

      // Watchdog: if step events stall mid-session, resubscribe.
      if (
        pedometerAvailableRef.current &&
        !pausedRef.current &&
        pedometerHasDeliveredRef.current &&
        (Date.now() - lastMovementAtRef.current) > 12000 &&
        (Date.now() - lastPedometerResubscribeAtRef.current) > 15000
      ) {
        lastPedometerResubscribeAtRef.current = Date.now();
        resubscribePedometer();
      }
    }, 1000);

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      const sub = watchRef.current;
      watchRef.current = null;
      sub?.remove();
      // Clean up pedometer subscription
      if (pedometerSubscriptionRef.current) {
        pedometerSubscriptionRef.current.remove();
        pedometerSubscriptionRef.current = null;
      }
      // Dismiss walk session notification
      if (isNotificationsSupported) {
        void notificationService.dismissWalkSessionNotification();
      }
    };
  }, [planId, requestPermissionAndTrack, computeElapsedSeconds, queueCheckpointSave]);

  // AppState listener: recalculate timer when returning from background,
  // reconcile pedometer steps, and re-check location permission.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // App returned to foreground: immediately recalculate elapsed time
        const elapsed = computeElapsedSeconds();
        if (!pausedRef.current) {
          setActiveSeconds(elapsed);
        }
        setTicks((prev) => prev + 1);
        if (isNotificationsSupported) {
          void notificationService.showWalkSessionNotification(formatClock(elapsed), pausedRef.current);
        }

        // Reconcile pedometer steps from background: try getStepCountAsync
        // (works on iOS, and Android with Health Connect / Google Fit).
        // If it fails, resubscribe watchStepCount to pick up fresh events.
        if (pedometerAvailableRef.current) {
          void (async () => {
            try {
              const now = new Date();
              const result = await Pedometer.getStepCountAsync(sessionStartTimeRef.current, now);
              if (isMountedRef.current && result.steps > stepsRef.current) {
                // getStepCountAsync returned a higher count — adopt it
                setSteps(result.steps);
                accumulatedStepsRef.current = result.steps;
                lastWatchStepsRef.current = 0;
                lastMovementAtRef.current = Date.now();
                setIsWalking(true);
                setHadWalkingSignal(true);
              }
            } catch {
              // getStepCountAsync not available (common on Android without Health Connect).
              // Resubscribe watchStepCount so we pick up steps going forward.
              // Preserve accumulated steps from the old subscription.
              accumulatedStepsRef.current += lastWatchStepsRef.current;
              lastWatchStepsRef.current = 0;
              if (pedometerSubscriptionRef.current) {
                pedometerSubscriptionRef.current.remove();
              }
              const sub = Pedometer.watchStepCount((result) => {
                if (!isMountedRef.current) return;
                if (!pausedRef.current) {
                  const totalSteps = accumulatedStepsRef.current + result.steps;
                  lastWatchStepsRef.current = result.steps;
                  setSteps(totalSteps);
                  lastMovementAtRef.current = Date.now();
                  setIsWalking(true);
                  setHadWalkingSignal(true);
                }
              });
              pedometerSubscriptionRef.current = sub;
            }
          })();
        }

      } else if (nextState === 'background') {
        void queueCheckpointSave();
        // Going to background: update notification with current time
        const elapsed = computeElapsedSeconds();
        if (isNotificationsSupported) {
          void notificationService.showWalkSessionNotification(formatClock(elapsed), pausedRef.current);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [computeElapsedSeconds, queueCheckpointSave]);

  // Notification action handler: Pause / Resume / End from notification shade
  useEffect(() => {
    if (!isNotificationsSupported) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type !== 'walk_session') return;
      notifActionRef.current(response.actionIdentifier);
    });

    return () => sub.remove();
  }, []);

  const resumeSession = useCallback(() => {
    const pauseStarted = pauseStartedAtRef.current;
    if (pauseStarted) {
      totalPausedMsRef.current += (Date.now() - pauseStarted);
    }
    pauseStartedAtRef.current = null;

    // Resubscribe the pedometer so that steps taken during the pause
    // are not counted. The new subscription starts its counter from 0.
    if (pedometerAvailableRef.current && pedometerSubscriptionRef.current) {
      accumulatedStepsRef.current = stepsAtPauseRef.current;
      lastWatchStepsRef.current = 0;
      pedometerSubscriptionRef.current.remove();
      const sub = Pedometer.watchStepCount((result) => {
        if (!isMountedRef.current) return;
        if (!pausedRef.current) {
          const totalSteps = accumulatedStepsRef.current + result.steps;
          lastWatchStepsRef.current = result.steps;
          setSteps(totalSteps);
          lastMovementAtRef.current = Date.now();
          setIsWalking(true);
          setHadWalkingSignal(true);
        }
      });
      pedometerSubscriptionRef.current = sub;
    }

    setPaused(false);
    void queueCheckpointSave();
    // Update notification to show Walking state
    if (isNotificationsSupported) {
      const elapsed = computeElapsedSeconds();
      void notificationService.showWalkSessionNotification(formatClock(elapsed), false);
    }
  }, [computeElapsedSeconds, queueCheckpointSave]);

  const pauseSession = useCallback(() => {
    pauseStartedAtRef.current = Date.now();
    setPaused(true);
    setIsWalking(false);
    // Snapshot pedometer state at pause: remember total steps so we can
    // discard any steps the hardware counts during the paused period.
    stepsAtPauseRef.current = stepsRef.current;
    void queueCheckpointSave();
    // Update notification to show Paused state
    if (isNotificationsSupported) {
      const elapsed = computeElapsedSeconds();
      void notificationService.showWalkSessionNotification(formatClock(elapsed), true);
    }
  }, [computeElapsedSeconds, queueCheckpointSave]);

  const togglePause = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (paused) {
      resumeSession();
      return;
    }
    pauseSession();
  };

  useEffect(() => {
    if (paused || showEndModal || showCompletion || showIdleModal) return;
    // Arm autopause only after we have at least one real walking signal.
    if (!hadWalkingSignal) return;

    const idleSeconds = Math.floor((Date.now() - lastMovementAtRef.current) / 1000);
    if (idleSeconds < INACTIVITY_PAUSE_SECONDS) return;

    pauseSession();
    setShowIdleModal(true);
    Vibration.vibrate(380);
    analyticsService.track('walk_inactive_auto_pause', {
      strictnessMode: preferences?.strictnessMode ?? 'easygoing',
      stepGoalEnabled: preferences?.stepGoalEnabled ?? false,
      stepGoal: preferences?.stepGoal ?? null,
      idleSeconds,
    });
  }, [
    hadWalkingSignal,
    paused,
    pauseSession,
    preferences?.stepGoal,
    preferences?.stepGoalEnabled,
    preferences?.strictnessMode,
    showCompletion,
    showEndModal,
    showIdleModal,
    ticks,
  ]);

  // Autopause modal should only close via user choice.

  const remainingSeconds = useMemo(() => {
    if (!plan) return activeSeconds;
    // Count down from the suggested walk duration based on how long the user
    // has actually been walking, instead of using the calendar end time.
    // This ensures the timer works even if the user opens the notification
    // after the originally-planned window has elapsed.
    const suggestedSeconds = plan.suggestedDurationMinutes * 60;
    return Math.max(0, suggestedSeconds - activeSeconds);
  }, [activeSeconds, plan]);

  const statusLabel = paused
    ? 'Paused'
    : isTracking
      ? (permissionDenied ? 'Location off' : (isWalking ? 'Walking now' : 'Not moving yet'))
      : (isWalking || hadWalkingSignal ? 'Walking now' : 'Not moving yet');

  const statusColor = paused
    ? '#f59e0b'
    : isWalking
      ? theme.colors.accentPrimary
      : permissionDenied
        ? '#ef4444'
        : palette.textMuted;

  const zoomBy = async (delta: number) => {
    const map = mapRef.current;
    if (!map?.getCamera || !map?.animateCamera) return;

    try {
      const camera = await map.getCamera();
      const currentZoom = typeof camera?.zoom === 'number' ? camera.zoom : 16;
      const nextZoom = Math.max(13, Math.min(20, currentZoom + delta));
      map.animateCamera({ zoom: nextZoom, center: currentCoord || DEFAULT_COORD }, { duration: 180 });
    } catch {
      // no-op
    }
  };

  const recenterMap = () => {
    const map = mapRef.current;
    if (!map?.animateCamera || !currentCoord) return;
    map.animateCamera({ center: currentCoord, zoom: 17 }, { duration: 220 });
  };

  const saveSession = async (options?: {
    showCompletion?: boolean;
    planStatus?: 'completed' | 'cancelled' | 'skipped';
    endReason?: 'manual' | 'idle_later';
  }) => {
    if (sessionFinalizedRef.current) return;
    sessionFinalizedRef.current = true;

    // Dismiss walk session notification
    if (isNotificationsSupported) {
      void notificationService.dismissWalkSessionNotification();
    }
    try {
      const finalPausedMs = totalPausedMsRef.current +
        (pauseStartedAtRef.current ? (Date.now() - pauseStartedAtRef.current) : 0);
      const finalPausedSeconds = Math.floor(finalPausedMs / 1000);
      const finalActiveSeconds = computeElapsedSeconds();
      setActiveSeconds(finalActiveSeconds);

      const session: WalkSession = {
        id: sessionIdRef.current,
        nudgePlanId: planId,
        start: startIsoRef.current,
        end: new Date().toISOString(),
        activeSeconds: finalActiveSeconds,
        pausedSeconds: finalPausedSeconds,
        distanceMeters,
        steps,
        usedLocation: isTracking && !permissionDenied,
        createdAt: new Date().toISOString(),
      };

      await sessionsRepo.save(session);
      // Ensure older queued writes cannot re-create checkpoint after successful save.
      await checkpointWriteChainRef.current.catch(() => undefined);
      await clearWalkCheckpoint();
      if (planId) {
        await plansRepo.updateStatus(planId, options?.planStatus ?? 'completed');
      }

      analyticsService.track('walk_completed', {
        planId: planId || null,
        activeSeconds: finalActiveSeconds,
        pausedSeconds: finalPausedSeconds,
        distanceMeters: Math.round(distanceMeters),
        steps,
        usedLocation: isTracking && !permissionDenied,
        hadWalkingSignal,
        endReason: options?.endReason ?? 'manual',
      });
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (options?.showCompletion === false) {
        allowLeaveRef.current = true;
        navigation.navigate('Dashboard');
        return;
      }

      setShowCompletion(true);
      completionPopAnim.setValue(0);
      completionBurstAnim.setValue(0);
      completionConfettiAnim.setValue(0);

      Vibration.vibrate([0, 120, 80, 120, 80, 200]);

      Animated.parallel([
        Animated.spring(completionPopAnim, {
          toValue: 1,
          tension: 65,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(completionBurstAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(completionConfettiAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        setShowCompletion(false);
        allowLeaveRef.current = true;
        navigation.navigate('Dashboard');
      }, 3500);
    } catch (e) {
      sessionFinalizedRef.current = false;
      if (__DEV__) console.warn('Failed to save walk session:', e);
    }
  };

  const confirmEnd = async () => {
    setShowEndModal(false);
    await saveSession();
  };

  const continueAfterIdlePause = () => {
    setShowIdleModal(false);
    lastMovementAtRef.current = Date.now();
    resumeSession();
  };

  const saveForLater = async () => {
    setShowIdleModal(false);
    await saveSession({ showCompletion: false, planStatus: 'cancelled', endReason: 'idle_later' });
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      setShowEndModal(true);
    });
    return unsubscribe;
  }, [navigation]);

  // Keep notifActionRef in sync with latest closures so notification actions work correctly
  notifActionRef.current = (actionId: string) => {
    if (actionId === WALK_SESSION_ACTION_PAUSE) {
      pauseSession();
    } else if (actionId === WALK_SESSION_ACTION_RESUME) {
      resumeSession();
    } else if (actionId === WALK_SESSION_ACTION_END) {
      void saveSession();
    }
  };

  const toggleSheet = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSheetExpanded((prev) => {
      const next = !prev;
      Animated.spring(sheetExpandAnim, {
        toValue: next ? 1 : 0,
        tension: 100,
        friction: 14,
        useNativeDriver: false,
      }).start();
      return next;
    });
  }, [sheetExpandAnim]);

  const sheetBg = themeMode === 'dark' ? 'rgba(6, 18, 43, 0.95)' : 'rgba(247, 251, 255, 0.97)';
  const topBarBg = themeMode === 'dark' ? '#061633' : '#f1f6ff';
  const sheetBorder = themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)';
  const handleColor = themeMode === 'dark' ? 'rgba(235,243,255,0.56)' : 'rgba(147, 161, 181, 0.95)';

  const completionOverlayBg = themeMode === 'dark' ? 'rgba(2, 8, 20, 0.88)' : 'rgba(236, 245, 255, 0.88)';
  const completionCardBg = themeMode === 'dark' ? '#0d1a35' : '#f7fbff';
  const completionCardBorder = themeMode === 'dark' ? 'rgba(46, 233, 166, 0.25)' : 'rgba(46, 233, 166, 0.3)';
  const statPillBg = themeMode === 'dark' ? 'rgba(46, 233, 166, 0.12)' : 'rgba(46, 233, 166, 0.1)';
  const statPillColor = themeMode === 'dark' ? '#2ee9a6' : '#0d7a50';
  const mapShadeColor = themeMode === 'dark' ? 'rgba(2, 8, 16, 0.04)' : 'rgba(141, 162, 186, 0.04)';
  const zoomBtnBg = themeMode === 'dark' ? 'rgba(12, 20, 36, 0.78)' : 'rgba(248, 252, 255, 0.95)';
  const zoomTextColor = themeMode === 'dark' ? '#eaf0ff' : '#10233e';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { backgroundColor: topBarBg, borderBottomColor: sheetBorder }]}>
        <Text variant="title" style={styles.topTitle}>Walking</Text>
      </View>

      <View style={styles.mapArea}>
        <View style={styles.mapFallback}>
          <View style={styles.mapFallbackIcon}>
            <Text variant="title" style={styles.mapFallbackEmoji}>🗺️</Text>
          </View>
          <Text variant="body" style={styles.mapFallbackTitle}>
            Maps Coming Soon
          </Text>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.mapFallbackSub}>
            Map view will be available in a future update.{' '}
            Your walk is still being tracked — distance, steps, and time update in real time below.
          </Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: sheetBg, borderColor: sheetBorder }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text variant="bodySmall" color={palette.textPrimary}>{statusLabel}</Text>
        </View>

      </View>

      <View style={[styles.sheet, { backgroundColor: sheetBg, borderTopColor: sheetBorder, paddingBottom: Math.max(insets.bottom + 8, 18) }]}>
        <Pressable
          onPress={toggleSheet}
          accessibilityRole="button"
          accessibilityLabel="walking-sheet-handle"
          style={styles.sheetHandleTouch}
        >
          <View style={[styles.sheetHandle, { backgroundColor: handleColor }]} />
        </Pressable>

        <Text variant="body" style={styles.timerLabel}>{plan ? 'Remaining Time' : 'Session Time'}</Text>
        <Text variant="heading" style={[styles.timerValue, !sheetExpanded && styles.timerValueCollapsed]}>
          {formatClock(remainingSeconds)}
        </Text>

        {sheetExpanded && (
          <Animated.View style={{
            opacity: sheetExpandAnim,
            maxHeight: sheetExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] }),
            overflow: 'hidden',
          }}>
            <View style={styles.metricRow}>
              <View style={[styles.metricCard, { backgroundColor: themeMode === 'dark' ? '#1a2a4a' : '#dfe9f9' }]}>
                <Text variant="body" style={styles.metricTitle}>Distance</Text>
                <Text variant="heading" style={styles.metricValue}>{formatMiles(distanceMeters)}</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: themeMode === 'dark' ? '#1a2a4a' : '#dfe9f9' }]}>
                <Text variant="body" style={styles.metricTitle}>Step Counter</Text>
                <Text variant="heading" style={styles.metricValue}>{steps.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Button
                title={paused ? 'Resume' : 'Pause'}
                onPress={togglePause}
                variant="secondary"
                style={styles.actionBtn}
                testID="walking-pause-resume"
              />
              <Button
                title="End"
                onPress={() => setShowEndModal(true)}
                variant="danger"
                style={styles.actionBtn}
                testID="walking-end"
              />
            </View>
          </Animated.View>
        )}
      </View>

      <Modal visible={showEndModal} onClose={() => setShowEndModal(false)} title="End this walk?">
        <Text variant="body" style={styles.modalText}>Your walk progress will be saved to today stats.</Text>
        <View style={styles.modalRow}>
          <Button
            title="Keep Walking"
            onPress={() => setShowEndModal(false)}
            variant="outline"
            style={styles.modalBtn}
            testID="walking-end-cancel"
          />
          <Button title="Yes, End" onPress={() => { void confirmEnd(); }} style={styles.modalBtn} testID="walking-end-confirm" />
        </View>
      </Modal>

      <Modal
        visible={showIdleModal}
        onClose={() => {}}
        title="No walking detected"
      >
        <Text variant="body" style={styles.modalText}>
          You are not walking right now. You can continue this session later.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="No, Continue"
            onPress={continueAfterIdlePause}
            variant="outline"
            style={styles.modalBtn}
            testID="walking-idle-continue"
          />
          <Button
            title="Yes, later"
            onPress={() => { void saveForLater(); }}
            style={styles.modalBtn}
            testID="walking-idle-later"
          />
        </View>
      </Modal>

      {showCompletion && (() => {
        const minutes = Math.max(1, Math.floor(activeSeconds / 60));
        const completionMessages = [
          'Every step added up. Well done.',
          'You made time for yourself today.',
          'Consistent effort builds lasting change.',
          'Another walk in the books.',
          'Progress, one walk at a time.',
          'Your future self will thank you.',
        ];
        const completionMessage = completionMessages[Math.floor(Date.now() / 60000) % completionMessages.length];

        const confettiIcons: Array<{ name: React.ComponentProps<typeof Ionicons>['name']; color: string }> = [
          { name: 'star', color: '#fbbf24' },
          { name: 'heart', color: '#f472b6' },
          { name: 'trophy', color: '#fbbf24' },
          { name: 'ribbon', color: '#2ee9a6' },
          { name: 'sparkles', color: '#a78bfa' },
          { name: 'medal', color: '#fb923c' },
        ];

        return (
          <Animated.View style={[styles.completionOverlay, { backgroundColor: completionOverlayBg, opacity: completionPopAnim }]} pointerEvents="none">
            {/* Confetti particles */}
            {confettiIcons.map((icon, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.confettiParticle,
                  {
                    left: `${15 + i * 14}%` as any,
                    opacity: completionConfettiAnim.interpolate({
                      inputRange: [0, 0.3, 0.7, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateY: completionConfettiAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-40, 250 + (i % 3) * 60],
                        }),
                      },
                      {
                        rotate: completionConfettiAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', `${(i % 2 === 0 ? 1 : -1) * (180 + i * 30)}deg`],
                        }),
                      },
                      {
                        scale: completionConfettiAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.3, 1.2, 0.8],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Ionicons name={icon.name} size={22} color={icon.color} />
              </Animated.View>
            ))}

            {/* Glow rings */}
            <Animated.View
              style={[
                styles.completionGlowRing,
                {
                  borderColor: '#2ee9a6',
                  opacity: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.5] }) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.completionGlowRing,
                {
                  borderColor: '#6366f1',
                  opacity: completionBurstAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 0] }),
                  transform: [{ scale: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3.0] }) }],
                },
              ]}
            />

            {/* Main completion card */}
            <Animated.View
              style={[
                styles.completionCard,
                {
                  backgroundColor: completionCardBg,
                  borderColor: completionCardBorder,
                  opacity: completionPopAnim,
                  transform: [{ scale: completionPopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                },
              ]}
            >
              {/* Glowing badge */}
              <View style={styles.completionBadgeOuter}>
                <View style={[styles.completionBadgeGlow, { shadowColor: '#2ee9a6' }]} />
                <View style={styles.completionBadge}>
                  <Ionicons name="checkmark-circle" size={38} color="#2ee9a6" />
                </View>
              </View>

              <Text variant="title" style={styles.completionTitle}>Walk complete</Text>
              <Text variant="bodySmall" color={palette.textMuted} style={styles.completionMotivational}>
                {completionMessage}
              </Text>

              {/* Stats pills */}
              <View style={styles.completionStatsRow}>
                <View style={[styles.completionStatPill, { backgroundColor: statPillBg }]}>
                  <Ionicons name="time-outline" size={18} color={statPillColor} style={styles.completionStatIcon} />
                  <Text style={[styles.completionStatValue, { color: statPillColor }]}>{minutes}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.completionStatLabel}>min</Text>
                </View>
                <View style={[styles.completionStatPill, { backgroundColor: statPillBg }]}>
                  <Ionicons name="footsteps-outline" size={18} color={statPillColor} style={styles.completionStatIcon} />
                  <Text style={[styles.completionStatValue, { color: statPillColor }]}>{steps.toLocaleString()}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.completionStatLabel}>steps</Text>
                </View>
                <View style={[styles.completionStatPill, { backgroundColor: statPillBg }]}>
                  <Ionicons name="navigate-outline" size={18} color={statPillColor} style={styles.completionStatIcon} />
                  <Text style={[styles.completionStatValue, { color: statPillColor }]}>{formatMiles(distanceMeters)}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.completionStatLabel}>dist</Text>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        );
      })()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    minHeight: 96,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  topTitle: {
    fontSize: 30,
    fontWeight: theme.fontWeight.semibold,
  },
  mapArea: {
    flex: 1,
    position: 'relative',
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  mapFallbackIcon: {
    marginBottom: 12,
  },
  mapFallbackEmoji: {
    fontSize: 40,
  },
  mapFallbackTitle: {
    fontWeight: theme.fontWeight.semibold,
    fontSize: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  mapFallbackSub: {
    textAlign: 'center',
    lineHeight: 20,
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
  },
  zoomStack: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.7,
  },
  zoomText: {
    fontWeight: theme.fontWeight.bold,
  },
  statusPill: {
    position: 'absolute',
    left: 16,
    top: 16,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  permissionCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 68,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  permissionTitle: {
    marginBottom: 12,
  },
  permissionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  permissionBtn: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  sheetHandleTouch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 18,
  },
  sheetHandle: {
    width: 56,
    height: 4,
    borderRadius: 4,
  },
  timerLabel: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
    fontWeight: theme.fontWeight.semibold,
  },
  timerValue: {
    textAlign: 'center',
    fontSize: 34,
    letterSpacing: 0.1,
    marginBottom: 24,
  },
  timerValueCollapsed: {
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  metricTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  modalText: {
    textAlign: 'center',
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    minWidth: 0,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  confettiParticle: {
    position: 'absolute',
    top: '10%',
    zIndex: 100,
  },
  completionGlowRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
  },
  completionCard: {
    minWidth: 280,
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1.5,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#2ee9a6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  completionBadgeOuter: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionBadgeGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 15,
  },
  completionBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 233, 166, 0.15)',
  },
  completionBadgeEmoji: {
    // Legacy – icon now rendered via Ionicons
  },
  completionTitle: {
    fontWeight: theme.fontWeight.bold,
    fontSize: 26,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  completionMotivational: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 8,
    fontStyle: 'italic',
  },
  completionStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  completionStatPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    gap: 4,
  },
  completionStatIcon: {
    marginBottom: 2,
  },
  completionStatValue: {
    fontSize: 18,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.2,
  },
  completionStatLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
