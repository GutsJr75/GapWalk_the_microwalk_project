import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, Easing, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Pedometer } from 'expo-sensors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { SensorHealth, ActiveWalkSnapshot, NudgePlan, WalkDisplayState, WalkMotionConfidence, WalkMotionState, WalkSession, WalkStepSource } from '../types';
import { plansRepo } from '../data/repositories/plansRepo';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { analyticsService } from '../services/analytics';
import { androidWalkTracking } from '../services/androidWalkTracking';
import { isNotificationsSupported, notificationService } from '../services/notifications';
import { requestWalkTrackingPermissions, WalkTrackingPermissionResults } from '../services/permissions';
import { saveWalkCheckpoint, clearWalkCheckpoint } from '../services/walkCheckpoint';
import { routeRepo } from '../data/repositories/routeRepo';
import { pauseEventsRepo } from '../data/repositories/pauseEventsRepo';
import { runBackendSync } from '../services/backendSync';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;

type CompletionKind = 'completed' | 'saved_later';

interface FallbackState {
  sessionId: string;
  startIso: string;
  activeSeconds: number;
  totalPausedMs: number;
  pauseStartedAtMs: number | null;
  paused: boolean;
  motionState: WalkMotionState;
  displayState: WalkDisplayState;
  pedometerHealth: SensorHealth;
  locationHealth: SensorHealth;
  motionConfidence: WalkMotionConfidence;
  stepSource: WalkStepSource;
  statusReason: string | null;
  distanceMeters: number;
  steps: number;
  usedLocation: boolean;
  locationPermissionGranted: boolean;
  backgroundLocationGranted: boolean;
  activityPermissionGranted: boolean;
  hadWalkingSignal: boolean;
  warning: string | null;
  pauseCount: number;
}

interface Coord {
  latitude: number;
  longitude: number;
}

const WALKING_LATCH_MS = 8_000;
const CALIBRATION_WINDOW_MS = 6_000;
const AUTO_PAUSE_MS = 30_000;
const WALKING_SPEED_THRESHOLD_MPS = 0.45;
const MIN_SEGMENT_METERS = 0.35;
const GPS_MOTION_SEGMENT_METERS = 1.2;
const GPS_MOTION_MAX_DT_SECONDS = 3;
const MAX_VALID_JUMP_METERS = 80;
const ESTIMATED_STRIDE_METERS = 0.78;
const START_COUNTDOWN_SECONDS = 3;
const MAP_LATITUDE_DELTA = 0.005;
const MAP_LONGITUDE_DELTA = 0.005;

const formatClock = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = String(clamped % 60).padStart(2, '0');
  return `${mins} min ${secs} sec`;
};

const formatClockDigital = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatMiles = (distanceMeters: number): string => `${(distanceMeters / 1609.34).toFixed(2)} mi`;

const displayLabel = (displayState: WalkDisplayState): string => {
  switch (displayState) {
    case 'walking':
      return 'Walking now';
    case 'paused':
      return 'Paused';
    case 'location_off':
      return 'Location needed';
    case 'not_moving':
      return 'Not moving';
    case 'sensor_issue':
      return 'Step sensor not responding';
    default:
      return 'Detecting movement...';
  }
};

const displayDetail = (
  displayState: WalkDisplayState,
  statusReason: string | null | undefined,
  hasPlan: boolean,
): string => {
  if (displayState === 'walking') {
    if (statusReason === 'Using GPS step backup') {
      return 'Motion is locked in. GapWalk is using GPS step backup until the device step sensor catches up.';
    }
    if (statusReason === 'Step sensor waiting') {
      return 'Walking is confirmed from movement. The device step sensor is still warming up.';
    }
    return hasPlan
      ? 'Movement is locked in. Keep the pace steady and this window stays on track.'
      : 'Live steps and distance are flowing in as you move.';
  }
  if (displayState === 'paused') {
    return 'Your walk is paused. Resume whenever you are ready to keep going.';
  }
  if (displayState === 'location_off') {
    return 'Turn on location access so GapWalk can keep distance updates accurate.';
  }
  if (displayState === 'not_moving') {
    return 'Tracking is still active. Start moving again to keep the session alive.';
  }
  if (displayState === 'sensor_issue') {
    return statusReason ?? 'The device step sensor is not responding yet. Keep moving or let GPS backup take over.';
  }
  return statusReason ?? 'Take a few steps so GapWalk can calibrate your live movement signal.';
};

const sensorHealthLabel = (prefix: string, health: SensorHealth): string => {
  if (health === 'active') return `${prefix} live`;
  if (health === 'stale') return `${prefix} waiting`;
  if (health === 'unsupported') return `${prefix} unavailable`;
  return `${prefix} denied`;
};

const stepSourceLabel = (stepSource: WalkStepSource, health: SensorHealth): string => {
  if (stepSource === 'gps_fallback') return 'GPS step backup';
  if (health === 'active') return 'Steps live';
  if (health === 'stale') return 'Step sensor waiting';
  if (health === 'unsupported') return 'Step sensor unavailable';
  return 'Step sensor permission needed';
};

const haversineMeters = (a: Coord, b: Coord): number => {
  const earthRadius = 6371e3;
  const phi1 = (a.latitude * Math.PI) / 180;
  const phi2 = (b.latitude * Math.PI) / 180;
  const deltaPhi = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLambda = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const createFallbackState = (): FallbackState => {
  const now = Date.now();
  return {
    sessionId: `s-${now}`,
    startIso: new Date(now).toISOString(),
    activeSeconds: 0,
    totalPausedMs: 0,
    pauseStartedAtMs: null,
    paused: false,
    motionState: 'starting',
    displayState: 'calibrating',
    pedometerHealth: 'stale',
    locationHealth: 'stale',
    motionConfidence: 'low',
    stepSource: 'none',
    statusReason: 'Detecting movement...',
    distanceMeters: 0,
    steps: 0,
    usedLocation: false,
    locationPermissionGranted: false,
    backgroundLocationGranted: false,
    activityPermissionGranted: false,
    hadWalkingSignal: false,
    warning: null,
    pauseCount: 0,
  };
};

export const WalkingScreen: React.FC<Props> = ({ navigation, route }) => {
  const planId = route.params?.planId;
  const prompt = route.params?.prompt;
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();
  const {
    preferences,
    themeMode,
    activeWalkSnapshot,
    setActiveWalkSnapshot,
    pendingWalkPrompt,
    setPendingWalkPrompt,
  } = useAppStore();

  const isAndroidService = Platform.OS === 'android' && androidWalkTracking.isSupported();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionKind, setCompletionKind] = useState<CompletionKind>('completed');
  const [completionStats, setCompletionStats] = useState<{ activeSeconds: number; distanceMeters: number; steps: number }>({
    activeSeconds: 0,
    distanceMeters: 0,
    steps: 0,
  });
  const [fallbackState, setFallbackState] = useState<FallbackState>(createFallbackState);
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [liveLocation, setLiveLocation] = useState<Coord | null>(null);
  const [isMapFollowingUser, setIsMapFollowingUser] = useState(true);

  const mapRef = useRef<MapView>(null);
  const lastAndroidSnapshotRef = useRef<ActiveWalkSnapshot | null>(activeWalkSnapshot);
  const allowLeaveRef = useRef(false);
  const fallbackStateRef = useRef<FallbackState>(fallbackState);
  const countdownTimerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasMarkedPlanStartedRef = useRef(false);
  const lastStepAtRef = useRef<number | null>(null);
  const lastGpsMotionAtRef = useRef<number | null>(null);
  const lastAcceptedLocationAtRef = useRef<number | null>(null);
  const lastMotionAtRef = useRef<number | null>(null);
  const lastCoordRef = useRef<{ coord: Coord; timestampMs: number } | null>(null);
  const lastSavedCoordRef = useRef<Coord | null>(null);
  const lastPedometerEventAtRef = useRef<number | null>(null);
  const pedometerBaseRef = useRef<number | null>(null);
  const pedometerSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const mapLocationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastFollowAnimateAtRef = useRef<number>(0);
  const statusPulseAnim = useRef(new Animated.Value(0)).current;
  const completionBackdropAnim = useRef(new Animated.Value(0)).current;
  const completionCardAnim = useRef(new Animated.Value(0)).current;
  const completionGlowAnim = useRef(new Animated.Value(0)).current;
  const completionStatAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const completionDismissLockedRef = useRef(false);
  const walkRhythmAnim = useRef(new Animated.Value(0)).current;
  const stepScaleAnim = useRef(new Animated.Value(1)).current;
  const distanceScaleAnim = useRef(new Animated.Value(1)).current;
  const speedScaleAnim = useRef(new Animated.Value(1)).current;
  const statusChangeAnim = useRef(new Animated.Value(1)).current;
  const clockColonAnim = useRef(new Animated.Value(1)).current;
  const dockGlowAnim = useRef(new Animated.Value(0)).current;
  const prevStepsRef = useRef(0);
  const prevDistanceRef = useRef(0);
  const prevSpeedRef = useRef('0.0');
  const lastMilestoneRef = useRef(0);

  const dotsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40 || g.vx < -0.4) {
          navigation.navigate('WalkingExpanded');
        } else if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
          navigation.navigate('WalkingExpanded');
        }
      },
    }),
  ).current;

  useEffect(() => {
    fallbackStateRef.current = fallbackState;
  }, [fallbackState]);

  useEffect(() => {
    lastAndroidSnapshotRef.current = activeWalkSnapshot;
  }, [activeWalkSnapshot]);

  const clearStartCountdown = useCallback(() => {
    countdownTimerIdsRef.current.forEach((timerId) => clearTimeout(timerId));
    countdownTimerIdsRef.current = [];
  }, []);

  const runStartCountdown = useCallback((onComplete: () => void) => {
    clearStartCountdown();
    setStartCountdown(START_COUNTDOWN_SECONDS);
    countdownTimerIdsRef.current = [
      setTimeout(() => setStartCountdown(2), 1000),
      setTimeout(() => setStartCountdown(1), 2000),
      setTimeout(() => {
        setStartCountdown(null);
        onComplete();
      }, 3000),
    ];
  }, [clearStartCountdown]);

  const markPlanStarted = useCallback(async () => {
    if (!planId || hasMarkedPlanStartedRef.current) return;
    const found = await plansRepo.getById(planId);
    if (!found) return;
    if (found.status === 'planned' || found.status === 'notified') {
      await plansRepo.updateStatus(planId, 'started');
    }
    hasMarkedPlanStartedRef.current = true;
  }, [planId]);

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    const found = await plansRepo.getById(planId);
    if (!found) return;
    setPlan(found);
  }, [planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const centerMapOnCoord = useCallback((coord: Coord, duration = 700) => {
    mapRef.current?.animateToRegion({
      ...coord,
      latitudeDelta: MAP_LATITUDE_DELTA,
      longitudeDelta: MAP_LONGITUDE_DELTA,
    }, duration);
  }, []);

  const remainingSeconds = useMemo(() => {
    const activeSeconds = isAndroidService
      ? (activeWalkSnapshot?.elapsedSeconds ?? 0)
      : fallbackState.activeSeconds;
    if (!plan) return activeSeconds;
    return Math.max(0, plan.suggestedDurationMinutes * 60 - activeSeconds);
  }, [activeWalkSnapshot?.elapsedSeconds, fallbackState.activeSeconds, isAndroidService, plan]);

  const displayedSnapshot = isAndroidService ? activeWalkSnapshot : null;
  const displayState: WalkDisplayState = isAndroidService
    ? (displayedSnapshot?.displayState ?? 'calibrating')
    : fallbackState.displayState;
  const pedometerHealth: SensorHealth = isAndroidService
    ? (displayedSnapshot?.pedometerHealth ?? 'stale')
    : fallbackState.pedometerHealth;
  const locationHealth: SensorHealth = isAndroidService
    ? (displayedSnapshot?.locationHealth ?? 'stale')
    : fallbackState.locationHealth;
  const motionConfidence: WalkMotionConfidence = isAndroidService
    ? (displayedSnapshot?.motionConfidence ?? 'low')
    : fallbackState.motionConfidence;
  const stepSource: WalkStepSource = isAndroidService
    ? (displayedSnapshot?.stepSource ?? 'none')
    : fallbackState.stepSource;
  const statusReason = isAndroidService
    ? (displayedSnapshot?.statusReason ?? null)
    : fallbackState.statusReason;
  const paused = isAndroidService
    ? !!displayedSnapshot?.paused
    : fallbackState.paused;
  const activeSeconds = isAndroidService
    ? (displayedSnapshot?.elapsedSeconds ?? 0)
    : fallbackState.activeSeconds;
  const distanceMeters = isAndroidService
    ? (displayedSnapshot?.distanceMeters ?? 0)
    : fallbackState.distanceMeters;
  const steps = isAndroidService
    ? (displayedSnapshot?.steps ?? 0)
    : fallbackState.steps;
  const permissionDenied = isAndroidService
    ? displayedSnapshot?.displayState === 'location_off'
    : fallbackState.displayState === 'location_off';
  const locationWarning = isAndroidService
    ? (displayedSnapshot?.warning ?? null)
    : fallbackState.warning;

  useEffect(() => {
    statusPulseAnim.stopAnimation();
    statusPulseAnim.setValue(0);

    if (displayState !== 'walking' && displayState !== 'calibrating') {
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulseAnim, {
          toValue: 1,
          duration: displayState === 'walking' ? 900 : 1500,
          useNativeDriver: true,
        }),
        Animated.timing(statusPulseAnim, {
          toValue: 0,
          duration: displayState === 'walking' ? 900 : 1500,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [displayState, statusPulseAnim]);

  useEffect(() => {
    walkRhythmAnim.stopAnimation();
    walkRhythmAnim.setValue(0);
    if (displayState !== 'walking') return undefined;
    const anim = Animated.loop(
      Animated.timing(walkRhythmAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [displayState, walkRhythmAnim]);

  useEffect(() => {
    if (steps === prevStepsRef.current || steps === 0) return;
    prevStepsRef.current = steps;
    stepScaleAnim.setValue(1.22);
    Animated.spring(stepScaleAnim, { toValue: 1, tension: 280, friction: 9, useNativeDriver: true }).start();
  }, [steps, stepScaleAnim]);

  useEffect(() => {
    if (distanceMeters === prevDistanceRef.current || distanceMeters === 0) return;
    prevDistanceRef.current = distanceMeters;
    distanceScaleAnim.setValue(1.16);
    Animated.spring(distanceScaleAnim, { toValue: 1, tension: 280, friction: 9, useNativeDriver: true }).start();
  }, [distanceMeters, distanceScaleAnim]);

  // Speed value bounce animation
  useEffect(() => {
    const currentSpeed = activeSeconds > 0
      ? ((distanceMeters / 1609.34) / (activeSeconds / 3600)).toFixed(1)
      : '0.0';
    if (currentSpeed === prevSpeedRef.current) return;
    prevSpeedRef.current = currentSpeed;
    speedScaleAnim.setValue(1.12);
    Animated.spring(speedScaleAnim, { toValue: 1, tension: 280, friction: 9, useNativeDriver: true }).start();
  }, [activeSeconds, distanceMeters, speedScaleAnim]);

  // Blinking colon on duration timer while actively walking
  useEffect(() => {
    if (paused || displayState !== 'walking') {
      clockColonAnim.setValue(1);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(clockColonAnim, {
          toValue: 0.3,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(clockColonAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [displayState, paused, clockColonAnim]);

  // Milestone haptic feedback every 100 steps
  useEffect(() => {
    if (steps === 0) return;
    const currentMilestone = Math.floor(steps / 100) * 100;
    if (currentMilestone > lastMilestoneRef.current && currentMilestone > 0) {
      lastMilestoneRef.current = currentMilestone;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
  }, [steps]);

  // Dock border glow while walking
  useEffect(() => {
    if (displayState === 'walking' && !paused) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(dockGlowAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(dockGlowAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }
    dockGlowAnim.setValue(0);
    return undefined;
  }, [displayState, paused, dockGlowAnim]);

  useEffect(() => {
    statusChangeAnim.setValue(0.88);
    Animated.spring(statusChangeAnim, { toValue: 1, tension: 220, friction: 8, useNativeDriver: true }).start();
  }, [displayState, statusChangeAnim]);

  useEffect(() => {
    if (!showCompletion) return;

    completionDismissLockedRef.current = true;
    completionBackdropAnim.setValue(0);
    completionCardAnim.setValue(0);
    completionGlowAnim.setValue(0);
    completionStatAnims.forEach((value) => value.setValue(0));

    Animated.parallel([
      Animated.timing(completionBackdropAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(completionCardAnim, {
        toValue: 1,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(completionGlowAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.stagger(
        80,
        completionStatAnims.map((value) => Animated.timing(value, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        })),
      ),
    ]).start(() => {
      completionDismissLockedRef.current = false;
    });
  }, [completionBackdropAnim, completionCardAnim, completionGlowAnim, completionStatAnims, showCompletion]);

  const applyAndroidSnapshot = useCallback((snapshot: ActiveWalkSnapshot | null) => {
    const previous = lastAndroidSnapshotRef.current;
    setActiveWalkSnapshot(snapshot);
    setPendingWalkPrompt(snapshot?.prompt ?? null);
    lastAndroidSnapshotRef.current = snapshot;
    if (snapshot) {
      setSessionStarted(true);
    }

    if (snapshot?.prompt === 'end_confirmation') {
      setShowIdleModal(false);
      setShowEndModal(true);
    }

    const autoPaused = snapshot?.paused &&
      snapshot.lastActionSource === 'auto_pause' &&
      (!previous?.paused || previous.lastActionSource !== 'auto_pause');
    if (autoPaused) {
      setShowEndModal(false);
      setShowIdleModal(true);
      analyticsService.track('walk_inactive_auto_pause', {
        strictnessMode: preferences?.strictnessMode ?? 'easygoing',
        stepGoalEnabled: preferences?.stepGoalEnabled ?? false,
        stepGoal: preferences?.stepGoal ?? null,
        idleSeconds: 30,
      });
    }
  }, [preferences?.stepGoal, preferences?.stepGoalEnabled, preferences?.strictnessMode, setActiveWalkSnapshot, setPendingWalkPrompt]);

  const refreshAndroidSnapshot = useCallback(async () => {
    if (!isAndroidService) return;
    const snapshot = await androidWalkTracking.getSnapshot();
    applyAndroidSnapshot(snapshot);
  }, [applyAndroidSnapshot, isAndroidService]);

  useEffect(() => {
    if (!isAndroidService) return;

    let cancelled = false;
    const subscription = androidWalkTracking.subscribe((snapshot) => {
      if (cancelled) return;
      applyAndroidSnapshot(snapshot);
    });

    void (async () => {
      const snapshot = await androidWalkTracking.getSnapshot();
      if (cancelled) return;

      if (snapshot) {
        await markPlanStarted();
        applyAndroidSnapshot(snapshot);
        return;
      }

      if (prompt === 'end_confirmation') return;

      await requestWalkTrackingPermissions();
      if (cancelled) return;

      runStartCountdown(() => {
        if (cancelled) return;
        void (async () => {
          const freshSnapshot = await androidWalkTracking.startSession({ planId });
          if (cancelled) return;
          await markPlanStarted();
          applyAndroidSnapshot(freshSnapshot);
        })();
      });
    })();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (previousState.match(/background|inactive/) && nextState === 'active') {
        void refreshAndroidSnapshot();
      }
    });

    return () => {
      cancelled = true;
      clearStartCountdown();
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [applyAndroidSnapshot, clearStartCountdown, isAndroidService, markPlanStarted, planId, prompt, refreshAndroidSnapshot, runStartCountdown]);

  useEffect(() => {
    if (!isAndroidService) {
      mapLocationSubscriptionRef.current?.remove();
      mapLocationSubscriptionRef.current = null;
      return;
    }

    let cancelled = false;
    mapLocationSubscriptionRef.current?.remove();
    mapLocationSubscriptionRef.current = null;

    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || !permission.granted) return;

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (location) => {
            if (cancelled) return;
            setLiveLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          },
        );

        if (cancelled) {
          subscription.remove();
          return;
        }
        mapLocationSubscriptionRef.current = subscription;
      } catch {
        // Ignore errors here; map location is an enhancement on top of walk tracking.
      }
    })();

    return () => {
      cancelled = true;
      mapLocationSubscriptionRef.current?.remove();
      mapLocationSubscriptionRef.current = null;
    };
  }, [isAndroidService]);

  useEffect(() => {
    if (!isMapFollowingUser || !liveLocation) return;
    const now = Date.now();
    if (now - lastFollowAnimateAtRef.current < 450) return;
    lastFollowAnimateAtRef.current = now;
    centerMapOnCoord(liveLocation, 650);
  }, [centerMapOnCoord, isMapFollowingUser, liveLocation]);

  const resolveFallbackPresentation = useCallback((state: FallbackState, nowMs: number) => {
    const recentStep = lastStepAtRef.current != null && nowMs - lastStepAtRef.current <= WALKING_LATCH_MS;
    const recentGpsMotion = lastGpsMotionAtRef.current != null && nowMs - lastGpsMotionAtRef.current <= WALKING_LATCH_MS;
    const recentAcceptedLocation = lastAcceptedLocationAtRef.current != null &&
      nowMs - lastAcceptedLocationAtRef.current <= WALKING_LATCH_MS;
    const isWalkingNow = recentStep || recentGpsMotion;
    const inCalibration = !state.paused &&
      !isWalkingNow &&
      nowMs - new Date(state.startIso).getTime() < CALIBRATION_WINDOW_MS;

    const motionState: WalkMotionState = state.paused
      ? 'paused'
      : isWalkingNow
        ? 'walking'
        : !state.locationPermissionGranted && !state.hadWalkingSignal
          ? 'location_off'
          : state.hadWalkingSignal
            ? 'not_moving'
            : 'starting';

    const displayState: WalkDisplayState = state.paused
      ? 'paused'
      : isWalkingNow
        ? 'walking'
        : !state.locationPermissionGranted && !state.hadWalkingSignal
          ? 'location_off'
          : inCalibration
            ? 'calibrating'
            : state.hadWalkingSignal
              ? 'not_moving'
              : 'sensor_issue';

    const pedometerHealth: SensorHealth = !state.activityPermissionGranted
      ? 'denied'
      : recentStep
        ? 'active'
        : 'stale';

    const locationHealth: SensorHealth = !state.locationPermissionGranted
      ? 'denied'
      : recentAcceptedLocation
        ? 'active'
        : 'stale';

    const motionConfidence: WalkMotionConfidence = recentStep && recentGpsMotion
      ? 'high'
      : recentStep || recentGpsMotion
        ? 'medium'
        : 'low';

    const stepSource: WalkStepSource = recentStep
      ? 'sensor'
      : state.stepSource === 'gps_fallback'
        ? 'gps_fallback'
        : 'none';

    const statusReason =
      stepSource === 'gps_fallback'
        ? 'Using GPS step backup'
        : displayState === 'walking' && recentGpsMotion && !recentStep && state.activityPermissionGranted
          ? 'Step sensor waiting'
          : displayState === 'sensor_issue' && state.activityPermissionGranted
            ? 'Step sensor not responding'
            : displayState === 'location_off'
              ? 'Location needed'
              : displayState === 'calibrating'
                ? 'Detecting movement...'
                : (!state.backgroundLocationGranted && state.locationPermissionGranted)
                  ? 'Background tracking limited'
                  : null;

    return {
      motionState,
      displayState,
      pedometerHealth,
      locationHealth,
      motionConfidence,
      stepSource,
      statusReason,
    };
  }, []);

  const hydrateFallbackState = useCallback((state: FallbackState, nowMs: number): FallbackState => ({
    ...state,
    ...resolveFallbackPresentation(state, nowMs),
  }), [resolveFallbackPresentation]);

  const updateFallbackState = useCallback((updater: (current: FallbackState) => FallbackState) => {
    setFallbackState((current) => {
      const next = updater(current);
      fallbackStateRef.current = next;
      return next;
    });
  }, []);

  const computeFallbackElapsedSeconds = useCallback((state: FallbackState, nowMs: number): number => {
    const currentPauseMs = state.pauseStartedAtMs ? nowMs - state.pauseStartedAtMs : 0;
    return Math.max(0, Math.floor((nowMs - new Date(state.startIso).getTime() - state.totalPausedMs - currentPauseMs) / 1000));
  }, []);

  const updateFallbackCheckpoint = useCallback(async () => {
    const state = fallbackStateRef.current;
    const currentPauseMs = state.pauseStartedAtMs ? (Date.now() - state.pauseStartedAtMs) : 0;
    await saveWalkCheckpoint({
      sessionId: state.sessionId,
      planId: planId ?? undefined,
      startIso: state.startIso,
      sessionStartMs: new Date(state.startIso).getTime(),
      totalPausedMs: state.totalPausedMs + currentPauseMs,
      distanceMeters: state.distanceMeters,
      steps: state.steps,
      paused: state.paused,
      usedLocation: state.usedLocation,
    });
  }, [planId]);

  const unsubscribeFallbackSensors = useCallback(() => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
  }, []);

  const subscribeFallbackPedometer = useCallback(() => {
    pedometerSubscriptionRef.current?.remove();
    pedometerBaseRef.current = null;

    const subscription = Pedometer.watchStepCount((result) => {
      const nowMs = Date.now();
      lastPedometerEventAtRef.current = nowMs;

      updateFallbackState((current) => {
        if (current.paused) return current;

        if (pedometerBaseRef.current == null) {
          pedometerBaseRef.current = result.steps - current.steps;
        }

        const totalSteps = Math.max(0, result.steps - (pedometerBaseRef.current ?? 0));
        lastStepAtRef.current = nowMs;
        lastMotionAtRef.current = nowMs;
        const nextState = {
          ...current,
          steps: Math.max(current.steps, totalSteps),
          stepSource: 'sensor' as WalkStepSource,
          hadWalkingSignal: totalSteps > 0 || current.hadWalkingSignal,
        };
        return hydrateFallbackState(nextState, nowMs);
      });
    });

    pedometerSubscriptionRef.current = subscription;
  }, [hydrateFallbackState, updateFallbackState]);

  const startFallbackTracking = useCallback(async (permissionResults?: WalkTrackingPermissionResults) => {
    unsubscribeFallbackSensors();

    const freshState = createFallbackState();
    fallbackStateRef.current = freshState;
    setFallbackState(freshState);
    setRouteCoords([]);
    setLiveLocation(null);
    setIsMapFollowingUser(true);
    lastStepAtRef.current = null;
    lastGpsMotionAtRef.current = null;
    lastAcceptedLocationAtRef.current = null;
    lastMotionAtRef.current = null;
    lastCoordRef.current = null;
    lastSavedCoordRef.current = null;
    lastPedometerEventAtRef.current = null;
    pedometerBaseRef.current = null;

    const resolvedPermissions = permissionResults ?? await requestWalkTrackingPermissions();
    updateFallbackState((current) => {
      const nextState = {
        ...current,
        locationPermissionGranted: resolvedPermissions.locationForeground,
        backgroundLocationGranted: resolvedPermissions.locationBackground,
        activityPermissionGranted: resolvedPermissions.activityRecognition,
        warning: resolvedPermissions.locationForeground && !resolvedPermissions.locationBackground
          ? 'Background location is off. Distance updates may pause when the app is not visible.'
          : null,
      };
      return hydrateFallbackState(nextState, Date.now());
    });

    if (resolvedPermissions.locationForeground) {
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          const nextCoord: Coord = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setLiveLocation(nextCoord);
          const timestampMs = typeof location.timestamp === 'number' ? location.timestamp : Date.now();
          const previous = lastCoordRef.current;
          lastCoordRef.current = { coord: nextCoord, timestampMs };

          // Accumulate route for map polyline
          setRouteCoords((prev) => [...prev, nextCoord]);

          // Throttled DB write: persist every ≥5 m to avoid excessive writes
          const lastSaved = lastSavedCoordRef.current;
          if (!lastSaved || haversineMeters(lastSaved, nextCoord) >= 5) {
            lastSavedCoordRef.current = nextCoord;
            void routeRepo.appendPoint(
              fallbackStateRef.current.sessionId,
              {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracyMeters: typeof location.coords.accuracy === 'number' && location.coords.accuracy >= 0
                  ? location.coords.accuracy
                  : undefined,
                altitudeMeters: typeof location.coords.altitude === 'number'
                  ? location.coords.altitude
                  : undefined,
                speedMps: typeof location.coords.speed === 'number' && location.coords.speed >= 0
                  ? location.coords.speed
                  : undefined,
                bearingDegrees: typeof location.coords.heading === 'number' && location.coords.heading >= 0
                  ? location.coords.heading
                  : undefined,
                recordedAt: new Date(timestampMs).toISOString(),
              }
            );
          }

          updateFallbackState((current) => {
            let nextState = current;

            if (previous) {
              const segmentMeters = haversineMeters(previous.coord, nextCoord);
              const dtSeconds = Math.max(1, timestampMs - previous.timestampMs) / 1000;
              const speedFromSensor = typeof location.coords.speed === 'number' && location.coords.speed >= 0
                ? location.coords.speed
                : null;
              const effectiveSpeed = speedFromSensor ?? segmentMeters / dtSeconds;
              const moving = !current.paused &&
                segmentMeters <= MAX_VALID_JUMP_METERS &&
                (
                  effectiveSpeed >= WALKING_SPEED_THRESHOLD_MPS ||
                  (segmentMeters >= GPS_MOTION_SEGMENT_METERS && dtSeconds <= GPS_MOTION_MAX_DT_SECONDS)
                );

              if (!current.paused && segmentMeters >= MIN_SEGMENT_METERS && segmentMeters <= MAX_VALID_JUMP_METERS) {
                const nextDistance = current.distanceMeters + segmentMeters;
                const pedometerStalled = lastPedometerEventAtRef.current == null ||
                  Date.now() - lastPedometerEventAtRef.current > WALKING_LATCH_MS;
                const usingGpsFallback = !current.activityPermissionGranted || pedometerStalled;
                const estimatedSteps = usingGpsFallback
                  ? Math.max(current.steps, Math.round(nextDistance / ESTIMATED_STRIDE_METERS))
                  : current.steps;
                nextState = {
                  ...current,
                  distanceMeters: nextDistance,
                  steps: estimatedSteps,
                  stepSource: usingGpsFallback ? 'gps_fallback' : current.stepSource,
                  usedLocation: true,
                };
                lastAcceptedLocationAtRef.current = timestampMs;
              }

              if (moving) {
                lastGpsMotionAtRef.current = timestampMs;
                lastMotionAtRef.current = timestampMs;
                nextState = {
                  ...nextState,
                  hadWalkingSignal: true,
                };
              }
            }

            return hydrateFallbackState(nextState, Date.now());
          });
        },
      );
    }

    if (resolvedPermissions.activityRecognition) {
      subscribeFallbackPedometer();
    }

    if (isNotificationsSupported && Platform.OS !== 'android') {
      await notificationService.setupWalkSessionCategories();
      await notificationService.showWalkSessionNotification(formatClock(0), false);
    }
  }, [hydrateFallbackState, subscribeFallbackPedometer, unsubscribeFallbackSensors, updateFallbackState]);

  useEffect(() => {
    if (isAndroidService) return;

    let cancelled = false;

    void (async () => {
      const permissionResults = await requestWalkTrackingPermissions();
      if (cancelled) return;

      // Update permission flags immediately so the map renders before the countdown finishes
      updateFallbackState((current) => ({
        ...current,
        locationPermissionGranted: permissionResults.locationForeground,
        backgroundLocationGranted: permissionResults.locationBackground,
        activityPermissionGranted: permissionResults.activityRecognition,
      }));

      runStartCountdown(() => {
        if (cancelled) return;
        void (async () => {
          await startFallbackTracking(permissionResults);
          if (cancelled) return;
          setSessionStarted(true);
          await markPlanStarted();
        })();
      });
    })();

    return () => {
      cancelled = true;
      clearStartCountdown();
      unsubscribeFallbackSensors();
      if (isNotificationsSupported && Platform.OS !== 'android') {
        void notificationService.dismissWalkSessionNotification();
      }
    };
  }, [clearStartCountdown, isAndroidService, markPlanStarted, runStartCountdown, startFallbackTracking, unsubscribeFallbackSensors, updateFallbackState]);

  useEffect(() => {
    if (isAndroidService || !sessionStarted) return;

    const timer = setInterval(() => {
      const nowMs = Date.now();
      updateFallbackState((current) => {
        const nextState = {
          ...current,
          activeSeconds: computeFallbackElapsedSeconds(current, nowMs),
        };
        return hydrateFallbackState(nextState, nowMs);
      });

      if (isNotificationsSupported && Platform.OS !== 'android') {
        void notificationService.showWalkSessionNotification(
          formatClock(fallbackStateRef.current.activeSeconds),
          fallbackStateRef.current.paused,
        );
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [computeFallbackElapsedSeconds, hydrateFallbackState, isAndroidService, sessionStarted, updateFallbackState]);

  useEffect(() => {
    if (isAndroidService) return;
    if (!sessionStarted) return;
    if (fallbackState.paused || showEndModal || showCompletion || showIdleModal) return;
    if (!fallbackState.hadWalkingSignal || lastMotionAtRef.current == null) return;

    const idleMs = Date.now() - lastMotionAtRef.current;
    if (idleMs < AUTO_PAUSE_MS) return;

    updateFallbackState((current) => ({
      ...hydrateFallbackState({
        ...current,
        paused: true,
        pauseStartedAtMs: Date.now(),
      }, Date.now()),
    }));
    setShowEndModal(false);
    setShowIdleModal(true);
    analyticsService.track('walk_inactive_auto_pause', {
      strictnessMode: preferences?.strictnessMode ?? 'easygoing',
      stepGoalEnabled: preferences?.stepGoalEnabled ?? false,
      stepGoal: preferences?.stepGoal ?? null,
      idleSeconds: Math.floor(idleMs / 1000),
    });
  }, [
    fallbackState.hadWalkingSignal,
    fallbackState.paused,
    isAndroidService,
    preferences?.stepGoal,
    preferences?.stepGoalEnabled,
    preferences?.strictnessMode,
    sessionStarted,
    showCompletion,
    showEndModal,
    showIdleModal,
    updateFallbackState,
  ]);

  useEffect(() => {
    if (prompt === 'end_confirmation' || pendingWalkPrompt === 'end_confirmation') {
      setShowIdleModal(false);
      setShowEndModal(true);
    }
  }, [pendingWalkPrompt, prompt]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !sessionStarted) return;
      event.preventDefault();
      setShowIdleModal(false);
      setShowEndModal(true);
    });
    return unsubscribe;
  }, [navigation, sessionStarted]);

  const dismissCompletion = useCallback(() => {
    if (!showCompletion || completionDismissLockedRef.current) return;
    completionDismissLockedRef.current = true;

    Animated.parallel([
      Animated.timing(completionBackdropAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(completionCardAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(completionGlowAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      ...completionStatAnims.map((value) => Animated.timing(value, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      })),
    ]).start(() => {
      setShowCompletion(false);
      allowLeaveRef.current = true;
      navigation.navigate('Dashboard', { showPostWalkSummary: true });
    });
  }, [completionBackdropAnim, completionCardAnim, completionGlowAnim, completionStatAnims, navigation, showCompletion]);

  const persistCompletedSession = useCallback(async (
    session: WalkSession,
    options?: {
      planStatus?: 'completed' | 'cancelled' | 'skipped';
      endReason?: 'manual' | 'idle_later';
      hadWalkingSignal?: boolean;
      showCompletion?: boolean;
    },
  ) => {
    const shouldResolveMatchingPlan = !session.nudgePlanId && (options?.planStatus ?? 'completed') === 'completed';
    const matchedPlan = shouldResolveMatchingPlan
      ? await plansRepo.findBestMatchingPlanForSession(session)
      : null;
    const resolvedSession = matchedPlan
      ? { ...session, nudgePlanId: matchedPlan.id }
      : session;

    await sessionsRepo.save(resolvedSession);
    if (resolvedSession.nudgePlanId) {
      await plansRepo.updateStatus(resolvedSession.nudgePlanId, options?.planStatus ?? 'completed');
    }

    // Fire-and-forget backend sync after every completed session
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

    if (!isAndroidService) {
      await clearWalkCheckpoint();
      if (isNotificationsSupported && Platform.OS !== 'android') {
        await notificationService.dismissWalkSessionNotification();
      }
    }

    setCompletionKind(options?.endReason === 'idle_later' ? 'saved_later' : 'completed');
    setCompletionStats({
      activeSeconds: resolvedSession.activeSeconds,
      distanceMeters: resolvedSession.distanceMeters ?? 0,
      steps: resolvedSession.steps ?? 0,
    });

    if (options?.showCompletion === false) {
      allowLeaveRef.current = true;
      navigation.navigate('Dashboard');
      return;
    }

    setShowCompletion(true);
  }, [isAndroidService, navigation]);

  const saveAndroidSession = useCallback(async (
    snapshot: ActiveWalkSnapshot | null,
    options?: {
      planStatus?: 'completed' | 'cancelled' | 'skipped';
      endReason?: 'manual' | 'idle_later';
      showCompletion?: boolean;
    },
  ) => {
    if (!snapshot) return;
    const pauseDelta = snapshot.pauseStartedAtMs ? Date.now() - snapshot.pauseStartedAtMs : 0;
    const sessionEndMs = Date.now();

    // Compute nudge-to-start latency: seconds from plan's walkStart to actual session start
    let nudgeToStartLatencySeconds: number | undefined;
    if (plan?.walkStart) {
      const latencyMs = new Date(snapshot.startIso).getTime() - new Date(plan.walkStart).getTime();
      if (latencyMs >= 0) nudgeToStartLatencySeconds = Math.round(latencyMs / 1000);
    }

    const pauseEvents = await pauseEventsRepo.getBySessionId(snapshot.sessionId);

    const session: WalkSession = {
      id: snapshot.sessionId,
      nudgePlanId: snapshot.planId || planId,
      start: snapshot.startIso,
      end: new Date(sessionEndMs).toISOString(),
      activeSeconds: snapshot.elapsedSeconds,
      pausedSeconds: Math.floor((snapshot.totalPausedMs + pauseDelta) / 1000),
      distanceMeters: snapshot.distanceMeters,
      steps: snapshot.steps,
      usedLocation: snapshot.usedLocation,
      createdAt: new Date().toISOString(),
      stepSource: snapshot.stepSource,
      motionConfidence: snapshot.motionConfidence,
      sensorHealthAtStart: snapshot.pedometerHealth,
      pauseCount: pauseEvents.length,
      nudgeToStartLatencySeconds,
    };

    setActiveWalkSnapshot(null);
    setPendingWalkPrompt(null);
    await persistCompletedSession(session, {
      ...options,
      hadWalkingSignal: snapshot.hadWalkingSignal,
    });
  }, [persistCompletedSession, plan, planId, setActiveWalkSnapshot, setPendingWalkPrompt]);

  const saveFallbackSession = useCallback(async (
    options?: {
      planStatus?: 'completed' | 'cancelled' | 'skipped';
      endReason?: 'manual' | 'idle_later';
      showCompletion?: boolean;
    },
  ) => {
    const current = fallbackStateRef.current;
    const pauseDelta = current.pauseStartedAtMs ? Date.now() - current.pauseStartedAtMs : 0;

    // Compute nudge-to-start latency
    let nudgeToStartLatencySeconds: number | undefined;
    if (plan?.walkStart) {
      const latencyMs = new Date(current.startIso).getTime() - new Date(plan.walkStart).getTime();
      if (latencyMs >= 0) nudgeToStartLatencySeconds = Math.round(latencyMs / 1000);
    }

    const session: WalkSession = {
      id: current.sessionId,
      nudgePlanId: planId,
      start: current.startIso,
      end: new Date().toISOString(),
      activeSeconds: computeFallbackElapsedSeconds(current, Date.now()),
      pausedSeconds: Math.floor((current.totalPausedMs + pauseDelta) / 1000),
      distanceMeters: current.distanceMeters,
      steps: current.steps,
      usedLocation: current.usedLocation,
      createdAt: new Date().toISOString(),
      stepSource: current.stepSource,
      motionConfidence: current.motionConfidence,
      sensorHealthAtStart: current.pedometerHealth,
      pauseCount: current.pauseCount,
      nudgeToStartLatencySeconds,
    };

    unsubscribeFallbackSensors();
    await persistCompletedSession(session, {
      ...options,
      hadWalkingSignal: current.hadWalkingSignal,
    });
  }, [computeFallbackElapsedSeconds, persistCompletedSession, plan, planId, unsubscribeFallbackSensors]);

  const togglePause = useCallback(async () => {
    setShowIdleModal(false);

    if (isAndroidService) {
      const snapshot = paused
        ? await androidWalkTracking.resumeSession('screen')
        : await androidWalkTracking.pauseSession('screen');
      applyAndroidSnapshot(snapshot);
      return;
    }

    const current = fallbackStateRef.current;
    updateFallbackState((current) => {
      const nowMs = Date.now();
      if (current.paused) {
        const pauseStartedAtMs = current.pauseStartedAtMs ?? nowMs;
        lastMotionAtRef.current = null;
        lastStepAtRef.current = null;
        lastGpsMotionAtRef.current = null;
        const nextState = {
          ...current,
          paused: false,
          pauseStartedAtMs: null,
          totalPausedMs: current.totalPausedMs + Math.max(0, nowMs - pauseStartedAtMs),
          stepSource: 'none' as WalkStepSource,
        };
        return hydrateFallbackState(nextState, nowMs);
      }

      return hydrateFallbackState({
        ...current,
        paused: true,
        pauseStartedAtMs: nowMs,
        pauseCount: current.pauseCount + 1,
      }, nowMs);
    });

    if (!current.paused && current.activityPermissionGranted) {
      pedometerSubscriptionRef.current?.remove();
      pedometerSubscriptionRef.current = null;
    } else if (current.paused && current.activityPermissionGranted) {
      subscribeFallbackPedometer();
    }
    await updateFallbackCheckpoint();
  }, [applyAndroidSnapshot, hydrateFallbackState, isAndroidService, paused, subscribeFallbackPedometer, updateFallbackCheckpoint, updateFallbackState]);

  const continueAfterIdlePause = useCallback(async () => {
    setShowIdleModal(false);
    if (isAndroidService) {
      const snapshot = await androidWalkTracking.resumeSession('screen');
      applyAndroidSnapshot(snapshot);
      return;
    }
    await togglePause();
  }, [applyAndroidSnapshot, isAndroidService, togglePause]);

  const saveForLater = useCallback(async () => {
    setShowIdleModal(false);
    if (isAndroidService) {
      const snapshot = await androidWalkTracking.confirmEndSession();
      await saveAndroidSession(snapshot, {
        planStatus: 'cancelled',
        endReason: 'idle_later',
      });
      return;
    }
    await saveFallbackSession({
      planStatus: 'cancelled',
      endReason: 'idle_later',
    });
  }, [isAndroidService, saveAndroidSession, saveFallbackSession]);

  const confirmEnd = useCallback(async () => {
    setShowEndModal(false);
    if (isAndroidService) {
      const snapshot = await androidWalkTracking.confirmEndSession();
      await saveAndroidSession(snapshot);
      return;
    }
    await saveFallbackSession();
  }, [isAndroidService, saveAndroidSession, saveFallbackSession]);

  const closeEndModal = useCallback(async () => {
    if (isAndroidService && activeWalkSnapshot?.prompt === 'end_confirmation') {
      const snapshot = await androidWalkTracking.cancelEndConfirmation();
      applyAndroidSnapshot(snapshot);
    }
    setShowEndModal(false);
  }, [activeWalkSnapshot?.prompt, applyAndroidSnapshot, isAndroidService]);

  const handleLocatePress = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coord: Coord = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setLiveLocation(coord);
      setIsMapFollowingUser(true);
      lastFollowAnimateAtRef.current = Date.now();
      centerMapOnCoord(coord, 800);
    } catch {
      // Ignore locate failures; permission/warning UI already handles guidance.
    }
  }, [centerMapOnCoord]);

  const statusColor = useMemo(() => {
    if (displayState === 'paused') return '#f59e0b';
    if (displayState === 'walking') return palette.accentPrimary;
    if (displayState === 'location_off' || displayState === 'sensor_issue') return '#ef4444';
    if (displayState === 'not_moving') return themeMode === 'dark' ? '#94a3b8' : '#475569';
    return themeMode === 'dark' ? '#8b9bbd' : '#64748b';
  }, [displayState, palette.accentPrimary, themeMode]);

  const statusTint = useMemo(() => {
    if (displayState === 'paused') return 'rgba(245,158,11,0.14)';
    if (displayState === 'walking') return themeMode === 'dark' ? 'rgba(46,233,166,0.14)' : 'rgba(5,150,105,0.12)';
    if (displayState === 'location_off' || displayState === 'sensor_issue') return 'rgba(239,68,68,0.12)';
    return themeMode === 'dark' ? 'rgba(139,155,189,0.12)' : 'rgba(71,85,105,0.10)';
  }, [displayState, themeMode]);

  const statusBorderColor = useMemo(() => {
    if (displayState === 'walking') return themeMode === 'dark' ? 'rgba(46,233,166,0.30)' : 'rgba(5,150,105,0.24)';
    if (displayState === 'paused') return 'rgba(245,158,11,0.28)';
    if (displayState === 'location_off' || displayState === 'sensor_issue') return 'rgba(239,68,68,0.24)';
    return palette.borderSoft;
  }, [displayState, palette.borderSoft, themeMode]);

  const heroTime = formatClock(plan ? remainingSeconds : activeSeconds);
  const heroSubLabel = plan ? 'Remaining time in this walk window' : 'Active session time';
  const heroStatusLabel = displayLabel(displayState);
  const heroStatusDetail = displayDetail(displayState, statusReason, !!plan);
  const pulseScale = statusPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, displayState === 'walking' ? 1.9 : 1.45],
  });
  const pulseOpacity = statusPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [displayState === 'walking' ? 0.28 : 0.18, 0],
  });
  const cardLift = statusPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displayState === 'walking' ? -4 : -2],
  });
  const rhythmDot0Opacity = walkRhythmAnim.interpolate({
    inputRange: [0, 0.33, 0.67, 1],
    outputRange: [1, 0.2, 0.2, 1],
  });
  const rhythmDot1Opacity = walkRhythmAnim.interpolate({
    inputRange: [0, 0.33, 0.67, 1],
    outputRange: [0.2, 1, 0.2, 0.2],
  });
  const rhythmDot2Opacity = walkRhythmAnim.interpolate({
    inputRange: [0, 0.33, 0.67, 1],
    outputRange: [0.2, 0.2, 1, 0.2],
  });
  const completionSavedForLater = completionKind === 'saved_later';
  const completionAccent = completionSavedForLater ? '#38bdf8' : palette.accentPrimary;
  const completionTitle = completionSavedForLater ? 'Progress saved for later' : 'Walk recorded';
  const completionSubtitle = completionSavedForLater
    ? 'Your progress is tucked away. Pick it back up whenever you are ready for the next stretch.'
    : 'Nice work. That session is safely logged and ready to count toward today.';
  const completionStatsItems = [
    {
      icon: completionSavedForLater ? 'time-outline' : 'timer-outline',
      label: 'Active time',
      value: formatClock(completionStats.activeSeconds),
    },
    {
      icon: completionSavedForLater ? 'walk' : 'navigate-outline',
      label: 'Distance',
      value: formatMiles(completionStats.distanceMeters),
    },
    {
      icon: completionSavedForLater ? 'bookmark' : 'footsteps',
      label: 'Steps',
      value: completionStats.steps.toLocaleString(),
    },
  ] as const;

  const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#1a2130' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8b9bbd' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1520' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#273348' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a2536' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4d6e' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1f35' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e2d3e' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#172a1f' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#212f45' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { backgroundColor: palette.bgSurface, borderBottomColor: palette.borderSoft }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBarBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={palette.textPrimary} />
        </Pressable>
        <Text variant="title" style={styles.topBarTitle}>Walking</Text>
        <View style={styles.topBarBtn} />
      </View>

      <View style={styles.body}>
        <View style={[styles.mapContainer, { backgroundColor: palette.bgSurface }]}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            onPanDrag={() => setIsMapFollowingUser((current) => (current ? false : current))}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
            customMapStyle={themeMode === 'dark' ? darkMapStyle : []}
          >
            {liveLocation && (
              <Marker coordinate={liveLocation} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.userLocationRing}>
                  <View style={styles.userLocationDot} />
                </View>
              </Marker>
            )}
            {routeCoords.length >= 2 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor={statusColor}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />
            )}
          </MapView>

          <View style={styles.heroOverlay}>
            <Animated.View style={[styles.heroStatusRow, { opacity: statusChangeAnim, transform: [{ scale: statusChangeAnim }] }]}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: statusTint,
                    borderColor: statusBorderColor,
                  },
                ]}
              >
                <View style={styles.statusDotWrap}>
                  {(displayState === 'walking' || displayState === 'calibrating') && (
                    <Animated.View
                      style={[
                        styles.statusDotPulse,
                        {
                          backgroundColor: statusColor,
                          opacity: pulseOpacity,
                          transform: [{ scale: pulseScale }],
                        },
                      ]}
                    />
                  )}
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                </View>
                <Ionicons
                  name={
                    displayState === 'walking' ? 'walk' :
                    displayState === 'paused' ? 'pause-circle-outline' :
                    displayState === 'not_moving' ? 'body-outline' :
                    displayState === 'location_off' ? 'location-outline' :
                    'radio-outline'
                  }
                  size={16}
                  color={statusColor}
                />
                <Text variant="body" style={[styles.statusPillText, { color: statusColor }]}>{heroStatusLabel}</Text>
              </View>
              <Pressable
                style={[
                  styles.mapIcon,
                  {
                    backgroundColor: palette.bgSurfaceElevated,
                    borderColor: isMapFollowingUser
                      ? (themeMode === 'dark' ? 'rgba(46,233,166,0.30)' : 'rgba(5,150,105,0.24)')
                      : palette.borderSoft,
                  },
                ]}
                onPress={() => { void handleLocatePress(); }}
              >
                <Ionicons name={isMapFollowingUser ? 'locate' : 'locate-outline'} size={20} color={statusColor} />
              </Pressable>
            </Animated.View>

          {(permissionDenied || locationWarning) && (
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: themeMode === 'dark' ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.08)',
                  borderColor: themeMode === 'dark' ? 'rgba(239,68,68,0.26)' : 'rgba(239,68,68,0.22)',
                },
              ]}
              testID="walking-location-deny"
            >
              <Ionicons name={permissionDenied ? 'location-outline' : 'alert-circle-outline'} size={18} color="#ef4444" />
              <View style={styles.warningCopy}>
                <Text variant="body" style={styles.warningTitle}>
                  {permissionDenied ? 'Location access is off' : 'Background tracking is limited'}
                </Text>
                <Text variant="bodySmall" color={palette.textMuted}>
                  {permissionDenied
                    ? 'Distance updates need location permission to stay accurate.'
                    : locationWarning}
                </Text>
              </View>
            </View>
          )}
          </View>
        </View>

        <Animated.View
          style={[
            styles.dock,
            {
              backgroundColor: palette.bgSurfaceElevated,
              borderColor: dockGlowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [palette.borderSoft, palette.accentBorder],
              }),
              paddingBottom: Math.max(insets.bottom + 10, 22),
            },
          ]}
        >
          <View style={styles.dockDots} {...dotsPanResponder.panHandlers}>
            <View style={[styles.dockDot, styles.dockDotActive, { backgroundColor: palette.accentPrimary }]} />
            <View style={[styles.dockDot, { backgroundColor: palette.borderStrong }]} />
          </View>

          <View style={styles.metricGrid}>
            <View style={[styles.metricCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
              <Text variant="body">Time Remaining</Text>
              {plan ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.metricDigitalClock}>
                    {formatClockDigital(remainingSeconds).split(':')[0]}
                  </Text>
                  <Animated.View style={{ opacity: clockColonAnim }}>
                    <Text style={styles.metricDigitalClock}>:</Text>
                  </Animated.View>
                  <Text style={styles.metricDigitalClock}>
                    {formatClockDigital(remainingSeconds).split(':').slice(1).join(':')}
                  </Text>
                </View>
              ) : (
                <Text variant="heading" style={styles.metricValue}>N/A</Text>
              )}
            </View>
            <View style={[styles.metricCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
              <Text variant="body">Distance</Text>
              <Animated.View style={{ transform: [{ scale: distanceScaleAnim }] }}>
                <Text variant="heading" style={styles.metricValue}>{formatMiles(distanceMeters)}</Text>
              </Animated.View>
            </View>
            <View style={[styles.metricCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
              <Text variant="body">Speed</Text>
              <Animated.View style={{ transform: [{ scale: speedScaleAnim }] }}>
                <Text variant="heading" style={styles.metricValue}>
                  {activeSeconds > 0 ? ((distanceMeters / 1609.34) / (activeSeconds / 3600)).toFixed(1) : '0.0'} mph
                </Text>
              </Animated.View>
            </View>
            <View style={[styles.metricCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSoft }]}>
              <Text variant="body">Steps</Text>
              <Animated.View style={{ transform: [{ scale: stepScaleAnim }] }}>
                <Text variant="heading" style={styles.metricValue}>{steps.toLocaleString()}</Text>
              </Animated.View>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                void togglePause();
              }}
              style={({ pressed }) => [
                styles.fabButton,
                {
                  backgroundColor: palette.bgSurface,
                  borderColor: palette.borderStrong,
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
              ]}
              testID="walking-pause-resume"
              hitSlop={8}
            >
              <Ionicons
                name={paused ? 'play' : 'pause'}
                size={26}
                color={palette.accentPrimary}
              />
            </Pressable>
            <Button
              title="End"
              onPress={() => setShowEndModal(true)}
              variant="danger"
              style={styles.actionButton}
              testID="walking-end"
            />
          </View>
        </Animated.View>
      </View>

      <Modal visible={showEndModal} onClose={() => { void closeEndModal(); }} title="End this walk?">
        <Text variant="body" style={styles.modalText}>
          Your walk progress will be saved to today&apos;s stats.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="Keep Walking"
            onPress={() => { void closeEndModal(); }}
            variant="outline"
            style={styles.modalButton}
            testID="walking-end-cancel"
          />
          <Button
            title="Yes, End"
            onPress={() => { void confirmEnd(); }}
            style={styles.modalButton}
            testID="walking-end-confirm"
          />
        </View>
      </Modal>

      <Modal visible={showIdleModal} onClose={() => {}} title="No walking detected">
        <Text variant="body" style={styles.modalText}>
          You are not walking right now. You can continue this session later.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="No, Continue"
            onPress={() => { void continueAfterIdlePause(); }}
            variant="outline"
            style={styles.modalButton}
            testID="walking-idle-continue"
          />
          <Button
            title="Yes, later"
            onPress={() => { void saveForLater(); }}
            style={styles.modalButton}
            testID="walking-idle-later"
          />
        </View>
      </Modal>

      {startCountdown != null && (
        <View style={[styles.countdownOverlay, { backgroundColor: palette.overlay }]}>
          <View
            style={[
              styles.countdownCard,
              {
                backgroundColor: palette.bgSurfaceElevated,
                borderColor: palette.borderSoft,
              },
            ]}
          >
            <Text variant="bodySmall" color={palette.textMuted} style={styles.countdownEyebrow}>
              Get ready
            </Text>
            <Text variant="title" style={styles.countdownValue}>
              {startCountdown}
            </Text>
            <Text variant="body" color={palette.textMuted} style={styles.countdownHint}>
              Your walk timer starts after the countdown.
            </Text>
          </View>
        </View>
      )}

      {showCompletion && (
        <Animated.View
          style={[
            styles.completionOverlay,
            {
              backgroundColor: palette.overlay,
              opacity: completionBackdropAnim,
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissCompletion} />
          <Animated.View
            style={[
              styles.completionCard,
              {
                backgroundColor: palette.bgSurfaceElevated,
                borderColor: themeMode === 'dark'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(15,23,42,0.10)',
                transform: [
                  {
                    translateY: completionCardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [26, 0],
                    }),
                  },
                  {
                    scale: completionCardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1],
                    }),
                  },
                ],
                opacity: completionCardAnim,
              },
            ]}
          >
            <View style={styles.completionHeroWrap}>
              <Animated.View
                style={[
                  styles.completionGlow,
                  {
                    backgroundColor: completionSavedForLater
                      ? (themeMode === 'dark' ? 'rgba(56,189,248,0.24)' : 'rgba(56,189,248,0.18)')
                      : (themeMode === 'dark' ? 'rgba(46,233,166,0.22)' : 'rgba(5,150,105,0.18)'),
                    opacity: completionGlowAnim,
                    transform: [
                      {
                        scale: completionGlowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.65, 1.18],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <View
                style={[
                  styles.completionHeroBadge,
                  {
                    backgroundColor: themeMode === 'dark'
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(255,255,255,0.75)',
                    borderColor: completionSavedForLater
                      ? 'rgba(56,189,248,0.28)'
                      : (themeMode === 'dark' ? 'rgba(46,233,166,0.28)' : 'rgba(5,150,105,0.24)'),
                  },
                ]}
              >
                <Ionicons
                  name={completionSavedForLater ? 'bookmark' : 'footsteps'}
                  size={38}
                  color={completionAccent}
                />
                <View style={[styles.completionSatellite, styles.completionSatelliteLeft]}>
                  <Ionicons
                    name={completionSavedForLater ? 'walk' : 'sparkles'}
                    size={18}
                    color={completionAccent}
                  />
                </View>
                <View style={[styles.completionSatellite, styles.completionSatelliteRight]}>
                  <Ionicons
                    name={completionSavedForLater ? 'time-outline' : 'checkmark-circle'}
                    size={18}
                    color={completionAccent}
                  />
                </View>
              </View>
            </View>

            <Text variant="title" style={styles.completionTitle}>
              {completionTitle}
            </Text>
            <Text variant="body" color={palette.textMuted} style={styles.completionBody}>
              {completionSubtitle}
            </Text>

            <View style={styles.completionStatsRow}>
              {completionStatsItems.map((item, index) => (
                <Animated.View
                  key={item.label}
                  style={[
                    styles.completionStatChip,
                    {
                      backgroundColor: palette.bgSurface,
                      borderColor: palette.borderSoft,
                      opacity: completionStatAnims[index],
                      transform: [
                        {
                          translateY: completionStatAnims[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [14, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons name={item.icon} size={16} color={completionAccent} />
                  <Text variant="bodySmall" color={palette.textMuted}>{item.label}</Text>
                  <Text variant="body" style={styles.completionStatValue}>{item.value}</Text>
                </Animated.View>
              ))}
            </View>

            <Button
              title="Back to dashboard"
              onPress={dismissCompletion}
              style={styles.completionButton}
            />
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  heroOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    pointerEvents: 'box-none',
  },
  mapIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  userLocationRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.48)',
  },
  userLocationDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#3b82f6',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusPillText: {
    fontWeight: theme.fontWeight.semibold,
  },
  statusDotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 999,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  confidencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  heroLabel: {
    opacity: 0.9,
  },
  heroTime: {
    fontSize: 24,
    lineHeight: 30,
  },
  heroSub: {
    opacity: 0.9,
  },
  heroDetail: {
    lineHeight: 24,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  warningCopy: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  rhythmRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  rhythmDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  confidenceBars: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
    marginRight: 2,
  },
  confidenceBar: {
    width: 4,
    borderRadius: 2,
  },
  dock: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  dockDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  dockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dockDotActive: {
    width: 20,
    borderRadius: 4,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: '48%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  metricDigitalClock: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
  },
  modalText: {
    marginBottom: 18,
    lineHeight: 22,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 120,
  },
  countdownCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  countdownEyebrow: {
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  countdownValue: {
    fontSize: 88,
    lineHeight: 94,
    fontWeight: theme.fontWeight.bold,
    marginBottom: 10,
  },
  countdownHint: {
    textAlign: 'center',
    lineHeight: 22,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  completionCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 14,
  },
  completionHeroWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  completionGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 999,
  },
  completionHeroBadge: {
    width: 84,
    height: 84,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionSatellite: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  completionSatelliteLeft: {
    left: -4,
    top: 8,
  },
  completionSatelliteRight: {
    right: -6,
    bottom: 10,
  },
  completionTitle: {
    textAlign: 'center',
  },
  completionBody: {
    textAlign: 'center',
    lineHeight: 24,
  },
  completionStatsRow: {
    width: '100%',
    gap: 10,
  },
  completionStatChip: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  completionStatValue: {
    fontWeight: theme.fontWeight.semibold,
  },
  completionButton: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
});
