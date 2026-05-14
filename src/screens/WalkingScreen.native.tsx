import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, AppStateStatus, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Pedometer } from 'expo-sensors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { Modal } from '../components/Modal';
import { AppIcon } from '../components/AppIcon';
import { WalkCompletionSummary } from '../components/WalkCompletionSummary';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { SensorHealth, ActiveWalkSnapshot, NudgePlan, WalkDisplayState, WalkMotionConfidence, WalkMotionState, WalkSession, WalkStepSource, WalkDisplayCard } from '../types';
import { plansRepo } from '../data/repositories/plansRepo';
import { analyticsService } from '../services/analytics';
import { androidWalkTracking } from '../services/androidWalkTracking';
import { isNotificationsSupported, notificationService } from '../services/notifications';
import {
  ForegroundLocationPermissionState,
  getForegroundLocationPermissionState,
  requestBackgroundWalkTrackingPermission,
  getWalkTrackingPermissionStatus,
  requestWalkTrackingPermissions,
  WalkTrackingPermissionResults,
} from '../services/permissions';
import { saveWalkCheckpoint, clearWalkCheckpoint } from '../services/walkCheckpoint';
import { routeRepo } from '../data/repositories/routeRepo';
import { pauseEventsRepo } from '../data/repositories/pauseEventsRepo';
import { useAppStore } from '../store';
import { useButtonPressMotion } from '../hooks/useButtonPressMotion';
import { getButtonVisualState } from '../components/buttonSystem';
import { PressGlowOverlay } from '../components/PressGlowOverlay';
import {
  buildWalkSessionFromAndroidCompletion,
  persistCompletedWalkSession,
} from '../services/walkSessionPersistence';

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
const WALK_STATE_UPDATE_ERROR_MESSAGE = 'Something went wrong updating your walk. Please try again.';
const METRIC_UPDATE_DURATION_MS = 180;
const STEP_METRIC_SCALE = 1.035;
const DISTANCE_METRIC_SCALE = 1.025;
const SPEED_METRIC_SCALE = 1.02;
const WALK_START_LOCATION_OVERLAY_SEEN_KEY = 'gapwalk_walk_start_location_overlay_seen_v1';
const WALK_START_LOCATION_OPTION_POINTS = [
  'Choose "Allow only while using the app" to enable live route and distance tracking.',
  'Choose "Allow all the time" to keep distance updating when the app is not visible.',
  'You can still start and continue walks if you decline.',
  'You can enable this later in Settings > Permissions > Location.',
];
const BACKGROUND_DISCLOSURE_BENEFIT_POINTS = [
  'Location is used only during an active walk session.',
  'Walk route and distance may sync securely to your GapWalk account.',
  'Distance keeps updating if you lock your screen or switch apps.',
  'GapWalk does not sell your personal data.',
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

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

const computeSpeedMph = (distanceMeters: number, activeSeconds: number): string => {
  if (activeSeconds <= 0) return '0.0';
  return ((distanceMeters / 1609.34) / (activeSeconds / 3600)).toFixed(1);
};

const getTimerDisplayParts = (seconds: number): { lead: string; trailing: string } => {
  const parts = formatClockDigital(seconds).split(':');
  return {
    lead: parts[0] ?? '00',
    trailing: parts.slice(1).join(':') || '00',
  };
};

const resolveStartupErrorMessage = (_error: unknown): string => {
  return 'GapWalk could not start the walk. Please try again.';
};

const computeSnapshotElapsedSeconds = (snapshot: ActiveWalkSnapshot | null, nowMs: number): number => {
  if (!snapshot) return 0;
  const currentPauseMs = snapshot.pauseStartedAtMs ? Math.max(0, nowMs - snapshot.pauseStartedAtMs) : 0;
  const computed = Math.max(0, Math.floor((nowMs - snapshot.sessionStartMs - snapshot.totalPausedMs - currentPauseMs) / 1000));
  return Math.max(snapshot.elapsedSeconds ?? 0, computed);
};


interface WalkNoticeCardProps {
  palette: ReturnType<typeof useThemePalette>;
  themeMode: 'light' | 'dark';
  iconName: IoniconName;
  title: string;
  message: string;
  tone?: 'danger' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
  onDismiss?: () => void;
}

const WalkNoticeCard: React.FC<WalkNoticeCardProps> = ({
  palette,
  themeMode,
  iconName,
  title,
  message,
  tone = 'warning',
  actionLabel,
  onAction,
  actionBusy = false,
  onDismiss,
}) => {
  const isDanger = tone === 'danger';
  const accentColor = isDanger ? '#dc2626' : '#b45309';
  const titleColor = isDanger
    ? (themeMode === 'dark' ? '#fecaca' : '#7f1d1d')
    : (themeMode === 'dark' ? '#ffedd5' : '#7c2d12');
  const messageColor = isDanger
    ? (themeMode === 'dark' ? '#fca5a5' : '#991b1b')
    : (themeMode === 'dark' ? '#fdba74' : '#9a3412');
  const backgroundColor = themeMode === 'dark'
    ? (isDanger ? 'rgba(220,38,38,0.22)' : 'rgba(180,83,9,0.20)')
    : (isDanger ? 'rgba(254,226,226,0.92)' : 'rgba(255,237,213,0.96)');
  const borderColor = themeMode === 'dark'
    ? (isDanger ? 'rgba(248,113,113,0.52)' : 'rgba(251,191,36,0.50)')
    : (isDanger ? 'rgba(239,68,68,0.42)' : 'rgba(217,119,6,0.40)');
  const actionBackgroundColor = themeMode === 'dark'
    ? (isDanger ? 'rgba(220,38,38,0.30)' : 'rgba(180,83,9,0.30)')
    : (isDanger ? 'rgba(254,226,226,0.95)' : 'rgba(255,247,237,0.98)');
  const actionBorderColor = themeMode === 'dark'
    ? (isDanger ? 'rgba(248,113,113,0.66)' : 'rgba(251,191,36,0.62)')
    : (isDanger ? 'rgba(239,68,68,0.46)' : 'rgba(217,119,6,0.44)');
  const actionScale = useRef(new Animated.Value(1)).current;

  const animateActionScale = useCallback((toValue: number, duration: number) => {
    Animated.timing(actionScale, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [actionScale]);

  const handleActionPress = useCallback(() => {
    if (!onAction || actionBusy) return;
    onAction();
  }, [actionBusy, onAction]);

  const handleActionPressIn = useCallback(() => {
    if (!onAction || actionBusy) return;
    animateActionScale(0.96, 90);
  }, [actionBusy, animateActionScale, onAction]);

  const handleActionPressOut = useCallback(() => {
    animateActionScale(1, 130);
  }, [animateActionScale]);

  return (
    <View style={[styles.noticeCard, { backgroundColor, borderColor }]}>
      <Ionicons name={iconName} size={18} color={accentColor} />
      <View style={styles.noticeCopy}>
        <View style={styles.noticeHeader}>
          <Text variant="body" style={[styles.noticeTitle, { color: titleColor }]}>{title}</Text>
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              hitSlop={6}
              style={({ pressed }) => [styles.warningDismiss, pressed && { opacity: 0.72 }]}
            >
              <Ionicons name="close" size={14} color={messageColor} />
            </Pressable>
          ) : null}
        </View>
        <Text variant="bodySmall" style={[styles.noticeMessage, { color: messageColor }]}>{message}</Text>
        {actionLabel ? (
          <AnimatedPressable
            onPress={handleActionPress}
            onPressIn={handleActionPressIn}
            onPressOut={handleActionPressOut}
            disabled={actionBusy || !onAction}
            hitSlop={6}
            style={({ pressed }) => [
              styles.noticeAction,
              {
                backgroundColor: actionBackgroundColor,
                borderColor: actionBorderColor,
                transform: [{ scale: actionScale }],
              },
              pressed && !actionBusy && { opacity: 0.9 },
            ]}
          >
            <View style={styles.noticeActionContent}>
              {actionBusy ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : null}
              <Text variant="bodySmall" style={[styles.noticeActionText, { color: accentColor }]}>
                {actionBusy ? 'Opening...' : actionLabel}
              </Text>
            </View>
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
};

interface WalkMetricCardProps {
  palette: ReturnType<typeof useThemePalette>;
  label: string;
  value: React.ReactNode;
  onPress?: () => void;
  centerValue?: boolean;
}

const WalkMetricCard: React.FC<WalkMetricCardProps> = ({
  palette,
  label,
  value,
  onPress,
  centerValue = false,
}) => {
  const cardStyle = [
    styles.metricCard,
    {
      backgroundColor: palette.bgSurface,
      borderColor: palette.borderSoft,
    },
  ];
  const valueWrapStyle = [styles.metricValueWrap, centerValue && styles.metricValueWrapCentered];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.82 }]}>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.metricLabel}>{label}</Text>
        <View style={valueWrapStyle}>{value}</View>
      </Pressable>
    );
  }

  return (
    <View style={cardStyle}>
      <Text variant="bodySmall" color={palette.textMuted} style={styles.metricLabel}>{label}</Text>
      <View style={valueWrapStyle}>{value}</View>
    </View>
  );
};

interface WalkActionButtonProps {
  palette: ReturnType<typeof useThemePalette>;
  label: string;
  iconName: IoniconName;
  tone?: 'neutral' | 'danger';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

const WalkActionButton: React.FC<WalkActionButtonProps> = ({
  palette,
  label,
  iconName,
  tone = 'neutral',
  onPress,
  disabled = false,
  testID,
}) => {
  const accentColor = tone === 'danger' ? theme.colors.white : palette.accentPrimary;
  const backgroundColor = tone === 'danger' ? theme.colors.danger : palette.bgSurface;
  const borderColor = tone === 'danger'
    ? 'rgba(239,68,68,0.18)'
    : palette.borderStrong;
  const btnVariant = tone === 'danger' ? 'danger' as const : 'primary' as const;
  const visualState = React.useMemo(
    () => getButtonVisualState(btnVariant, palette),
    [btnVariant, palette],
  );
  const {
    animatedTransformStyle,
    scaleAnim,
    pressScale,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = useButtonPressMotion({
    onPress,
    enabled: !disabled,
    size: 'default',
    hapticIntent: tone === 'danger' ? 'destructive' : 'selection',
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      testID={testID}
      style={[
        styles.walkActionButton,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.6 : 1,
          overflow: 'hidden' as const,
        },
        animatedTransformStyle,
      ]}
    >
      <PressGlowOverlay
        scaleAnim={scaleAnim}
        pressScale={pressScale}
        glowColor={disabled ? null : visualState.glowColor}
        glowOpacity={visualState.glowOpacity}
        borderRadius={16}
      />
      <Ionicons name={iconName} size={18} color={accentColor} />
      <Text variant="body" style={[styles.walkActionButtonLabel, { color: accentColor }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
};

interface WalkingBackButtonProps {
  palette: ReturnType<typeof useThemePalette>;
  onPress: () => void;
}

const WalkingBackButton: React.FC<WalkingBackButtonProps> = ({
  onPress,
}) => {
  return (
    <IconButton
      onPress={onPress}
      iconName="back"
      variant="secondary"
      size="icon"
      accessibilityLabel="Back"
    />
  );
};

const displayLabel = (displayState: WalkDisplayState): string => {
  switch (displayState) {
    case 'walking':
      return 'Walking';
    case 'paused':
      return 'Paused';
    case 'not_moving':
      return 'Idle';
    default:
      return 'Walking';
  }
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

const createForegroundLocationAccessState = (): ForegroundLocationPermissionState => ({
  granted: false,
  canAskAgain: true,
  status: Location.PermissionStatus.UNDETERMINED,
});

export const WalkingScreen: React.FC<Props> = ({ navigation, route }) => {
  const planId = route.params?.planId;
  const prompt = route.params?.prompt;
  const startedFromNotification = route.params?.startedFromNotification === true;
  const skipStartCountdown = route.params?.skipStartCountdown === true;
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const palette = useThemePalette();
  const {
    preferences,
    themeMode,
    distanceUnit,
    activeWalkSnapshot,
    setActiveWalkSnapshot,
    pendingWalkPrompt,
    setPendingWalkPrompt,
    walkDisplayCards,
    notificationTimerMode,
    notificationStatsMode,
    endWalkMode,
  } = useAppStore();

  const isAndroidService = Platform.OS === 'android' && androidWalkTracking.isSupported();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionKind, setCompletionKind] = useState<CompletionKind>('completed');
  const [completionSessionId, setCompletionSessionId] = useState<string | null>(null);
  const [completionStats, setCompletionStats] = useState<{ activeSeconds: number; distanceMeters: number; steps: number }>({
    activeSeconds: 0,
    distanceMeters: 0,
    steps: 0,
  });
  const [uiTickMs, setUiTickMs] = useState(() => Date.now());
  const [fallbackState, setFallbackState] = useState<FallbackState>(createFallbackState);
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [isStartingWalk, setIsStartingWalk] = useState(false);

  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [liveLocation, setLiveLocation] = useState<Coord | null>(null);
  const [liveHeading, setLiveHeading] = useState<number>(0);
  const [isMapFollowingUser, setIsMapFollowingUser] = useState(true);
  const [foregroundLocationAccess, setForegroundLocationAccess] = useState<ForegroundLocationPermissionState>(
    createForegroundLocationAccessState,
  );
  const [showMapPermissionHelp, setShowMapPermissionHelp] = useState(false);
  const [showWalkStartLocationOverlay, setShowWalkStartLocationOverlay] = useState(false);
  const [showBackgroundDisclosureModal, setShowBackgroundDisclosureModal] = useState(false);
  const [isRequestingBackgroundUpgrade, setIsRequestingBackgroundUpgrade] = useState(false);
  const [plannedDurationNoticeDismissed, setPlannedDurationNoticeDismissed] = useState(false);

  const mapRef = useRef<MapView>(null);
  const isMountedRef = useRef(true);
  const lastAndroidSnapshotRef = useRef<ActiveWalkSnapshot | null>(activeWalkSnapshot);
  const allowLeaveRef = useRef(false);
  const fallbackStateRef = useRef<FallbackState>(fallbackState);
  const countdownTimerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startFlowLockedRef = useRef(false);
  const hasMarkedPlanStartedRef = useRef(false);
  const lastCheckpointBucketRef = useRef(0);
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
  const androidAutoStartAttemptedRef = useRef(false);
  const stepScaleAnim = useRef(new Animated.Value(1)).current;
  const distanceScaleAnim = useRef(new Animated.Value(1)).current;
  const speedScaleAnim = useRef(new Animated.Value(1)).current;
  const statusChangeAnim = useRef(new Animated.Value(1)).current;
  const clockColonAnim = useRef(new Animated.Value(1)).current;
  const dockGlowAnim = useRef(new Animated.Value(0)).current;
  const skipInitialStartCountdownRef = useRef(skipStartCountdown);
  const prevStepsRef = useRef(0);
  const prevDistanceRef = useRef(0);
  const prevSpeedRef = useRef('0.0');
  const lastMilestoneRef = useRef(0);
  const walkStartLocationOverlayResolverRef = useRef<(() => void) | null>(null);
  const backgroundDisclosureResolverRef = useRef<((value: boolean) => void) | null>(null);
  const durationReachedHapticSentRef = useRef(false);

  const animateMetricScale = useCallback((
    value: Animated.Value,
    peakScale: number,
  ) => {
    value.stopAnimation();
    value.setValue(peakScale);
    Animated.timing(value, {
      toValue: 1,
      duration: METRIC_UPDATE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // Flippable card state
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const flipHintDone = useRef(false);

  const syncForegroundLocationAccess = useCallback(async () => {
    const status = await getForegroundLocationPermissionState();
    if (!isMountedRef.current) return status;

    setForegroundLocationAccess(status);

    if (!status.granted) {
      mapLocationSubscriptionRef.current?.remove();
      mapLocationSubscriptionRef.current = null;
      setLiveLocation(null);
      setLiveHeading(0);
      setIsMapFollowingUser(false);
    }

    return status;
  }, []);

  const hasSeenWalkStartLocationOverlay = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      return (await SecureStore.getItemAsync(WALK_START_LOCATION_OVERLAY_SEEN_KEY)) === '1';
    } catch {
      return false;
    }
  }, []);

  const markWalkStartLocationOverlaySeen = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    try {
      await SecureStore.setItemAsync(WALK_START_LOCATION_OVERLAY_SEEN_KEY, '1');
    } catch {
      // Non-critical. The flow still works without persistence.
    }
  }, []);

  const resolveWalkStartLocationOverlay = useCallback(() => {
    const resolver = walkStartLocationOverlayResolverRef.current;
    walkStartLocationOverlayResolverRef.current = null;
    setShowWalkStartLocationOverlay(false);
    resolver?.();
  }, []);

  const waitForWalkStartLocationOverlay = useCallback((): Promise<void> => {
    if (Platform.OS !== 'android') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (walkStartLocationOverlayResolverRef.current) {
        walkStartLocationOverlayResolverRef.current();
      }
      walkStartLocationOverlayResolverRef.current = resolve;
      setShowWalkStartLocationOverlay(true);
    });
  }, []);

  const resolveBackgroundDisclosure = useCallback((accepted: boolean) => {
    const resolver = backgroundDisclosureResolverRef.current;
    backgroundDisclosureResolverRef.current = null;
    setShowBackgroundDisclosureModal(false);
    resolver?.(accepted);
  }, []);

  const requestBackgroundDisclosureConfirmation = useCallback((): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const existingResolver = backgroundDisclosureResolverRef.current;
      if (existingResolver) {
        existingResolver(false);
      }
      backgroundDisclosureResolverRef.current = resolve;
      setShowBackgroundDisclosureModal(true);
    });
  }, []);

  const requestWalkPermissionsForStart = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return requestWalkTrackingPermissions();
    }

    const hasSeenOverlay = await hasSeenWalkStartLocationOverlay();
    if (!hasSeenOverlay) {
      await waitForWalkStartLocationOverlay();
      await markWalkStartLocationOverlaySeen();
      return requestWalkTrackingPermissions({
        requestMode: 'walk_start_first_time',
      });
    }

    return requestWalkTrackingPermissions({
      requestMode: 'walk_start_recurring',
    });
  }, [hasSeenWalkStartLocationOverlay, markWalkStartLocationOverlaySeen, waitForWalkStartLocationOverlay]);

  useEffect(() => () => {
    isMountedRef.current = false;
    const overlayResolver = walkStartLocationOverlayResolverRef.current;
    walkStartLocationOverlayResolverRef.current = null;
    overlayResolver?.();
    const resolver = backgroundDisclosureResolverRef.current;
    backgroundDisclosureResolverRef.current = null;
    resolver?.(false);
  }, []);

  useEffect(() => {
    fallbackStateRef.current = fallbackState;
  }, [fallbackState]);

  useEffect(() => {
    lastAndroidSnapshotRef.current = activeWalkSnapshot;
  }, [activeWalkSnapshot]);

  // Flip hint: partial flip ~30° then bounce back on first mount
  useEffect(() => {
    if (flipHintDone.current) return;
    flipHintDone.current = true;
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(flipAnim, {
          toValue: 0.17,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(flipAnim, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1200);
    return () => clearTimeout(timer);
  }, [flipAnim]);

  // Flip card toggle
  const toggleFlip = useCallback(() => {
    const toValue = isFlipped ? 0 : 1;
    setIsFlipped(!isFlipped);
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [flipAnim, isFlipped]);

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

  const runOrSkipStartCountdown = useCallback((
    shouldSkipCountdown: boolean,
    onComplete: () => void,
  ) => {
    clearStartCountdown();
    if (shouldSkipCountdown) {
      setStartCountdown(null);
      onComplete();
      return;
    }
    runStartCountdown(onComplete);
  }, [clearStartCountdown, runStartCountdown]);

  useEffect(() => {
    if (!route.params?.skipStartCountdown) return;
    navigation.setParams({ skipStartCountdown: undefined });
  }, [navigation, route.params?.skipStartCountdown]);

  const markPlanStarted = useCallback(async () => {
    if (!planId || hasMarkedPlanStartedRef.current) return;
    const found = await plansRepo.getById(planId);
    if (!found) return;
    if (found.status === 'planned' || found.status === 'notified') {
      await plansRepo.updateStatus(planId, 'started');
      if (isNotificationsSupported) {
        await notificationService.clearPlanNotifications(planId);
      }
    }
    hasMarkedPlanStartedRef.current = true;
  }, [planId]);

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    const found = await plansRepo.getById(planId);
    if (!found) return;
    setPlan(found);
  }, [planId]);

  const startAndroidSession = useCallback(async () => {
    let targetDurationMinutes = plan?.suggestedDurationMinutes ?? null;
    if (!targetDurationMinutes && planId) {
      const found = await plansRepo.getById(planId);
      if (found) {
        targetDurationMinutes = found.suggestedDurationMinutes;
        setPlan((current) => current ?? found);
      }
    }
    return androidWalkTracking.startSession({
      planId,
      targetDurationMinutes,
      startedFromNotification,
      notificationTimerMode,
      notificationStatsMode,
      distanceUnit,
    });
  }, [distanceUnit, notificationTimerMode, notificationStatsMode, plan, planId, startedFromNotification]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    void syncForegroundLocationAccess();
  }, [syncForegroundLocationAccess]);

  const centerMapOnCoord = useCallback((coord: Coord, duration = 700) => {
    mapRef.current?.animateToRegion({
      ...coord,
      latitudeDelta: MAP_LATITUDE_DELTA,
      longitudeDelta: MAP_LONGITUDE_DELTA,
    }, duration);
  }, []);

  const displayedSnapshot = isAndroidService ? activeWalkSnapshot : null;
  const hasLiveSession = isAndroidService
    ? Boolean(displayedSnapshot?.sessionId)
    : sessionStarted;

  useEffect(() => {
    if (!isAndroidService || !hasLiveSession || !displayedSnapshot) return undefined;

    setUiTickMs(Date.now());
    const timer = setInterval(() => {
      setUiTickMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [displayedSnapshot, hasLiveSession, isAndroidService]);

  const displayState: WalkDisplayState = isAndroidService
    ? (displayedSnapshot?.displayState ?? 'calibrating')
    : fallbackState.displayState;
  const paused = isAndroidService
    ? !!displayedSnapshot?.paused
    : fallbackState.paused;
  const activeSeconds = isAndroidService
    ? computeSnapshotElapsedSeconds(displayedSnapshot, uiTickMs)
    : fallbackState.activeSeconds;
  const distanceMeters = isAndroidService
    ? (displayedSnapshot?.distanceMeters ?? 0)
    : fallbackState.distanceMeters;
  const steps = isAndroidService
    ? (displayedSnapshot?.steps ?? 0)
    : fallbackState.steps;
  const hasStartupIssue = !hasLiveSession && startupError != null;
  const liveSessionId = isAndroidService
    ? (displayedSnapshot?.sessionId ?? null)
    : (sessionStarted ? fallbackState.sessionId : null);
  const locationLostMidWalk = !isAndroidService
    && sessionStarted
    && fallbackState.hadWalkingSignal
    && fallbackState.usedLocation
    && fallbackState.locationHealth === 'stale'
    && !fallbackState.paused;
  const backgroundTrackingLimited = isAndroidService
    ? (
      hasLiveSession &&
      Boolean(displayedSnapshot?.locationPermissionGranted) &&
      !Boolean(displayedSnapshot?.backgroundLocationGranted)
    )
    : (
      sessionStarted &&
      fallbackState.locationPermissionGranted &&
      !fallbackState.backgroundLocationGranted
    );
  const canShowMap = foregroundLocationAccess.granted;
  const mapPermissionActionLabel = 'Go to settings';
  const mapPermissionToggleLabel = showMapPermissionHelp ? 'Hide Settings Steps' : 'Show Settings Steps';
  const mapPermissionTitle = 'Provide location permission to view the map';
  const mapPermissionMessage = 'GapWalk shows your live position and route only after location access is enabled for this app.';
  const mapPermissionScale = useMemo(() => {
    const widthScale = clamp(windowWidth / 390, 0.82, 1);
    const heightScale = clamp(windowHeight / 844, 0.74, 1);
    return Math.min(widthScale, heightScale);
  }, [windowHeight, windowWidth]);
  const mapPermissionCompactStyles = useMemo(() => {
    const permissionFontShrinkFactor = 0.8;
    const cardHorizontalPadding = clamp(Math.round(20 * mapPermissionScale), 14, 20);
    const cardVerticalPadding = clamp(Math.round(24 * mapPermissionScale), 14, 24);
    const iconSize = clamp(Math.round(56 * mapPermissionScale), 42, 56);
    const titleSize = clamp(Math.round(25 * mapPermissionScale * permissionFontShrinkFactor), 14, 20);
    const titleLineHeight = Math.ceil(titleSize * 1.22);
    const bodySize = clamp(Math.round(16 * mapPermissionScale), 13, 16);
    const hintSize = clamp(Math.round(14 * mapPermissionScale * permissionFontShrinkFactor), 10, 12);
    const hintLineHeight = Math.ceil(hintSize * 1.3);
    const supportTextSize = clamp(Math.round((bodySize + hintSize) / 2), 12, 14);
    const supportTextLineHeight = supportTextSize + 5;
    const toggleSize = clamp(Math.round(14 * mapPermissionScale * permissionFontShrinkFactor), 10, 12);
    const toggleLineHeight = Math.ceil(toggleSize * 1.3);
    const buttonSize = clamp(Math.round(16 * mapPermissionScale), 13, 16);
    const buttonLineHeight = buttonSize + 5;

    return {
      gate: {
        padding: clamp(Math.round(20 * mapPermissionScale), 10, 20),
      },
      card: {
        paddingHorizontal: cardHorizontalPadding,
        paddingVertical: cardVerticalPadding,
      },
      iconWrap: {
        width: iconSize,
        height: iconSize,
        borderRadius: iconSize / 2,
        marginBottom: clamp(Math.round(16 * mapPermissionScale), 10, 16),
      },
      title: {
        fontSize: titleSize,
        lineHeight: titleLineHeight,
        marginBottom: clamp(Math.round(10 * mapPermissionScale), 6, 10),
      },
      message: {
        fontSize: supportTextSize,
        lineHeight: supportTextLineHeight,
      },
      hint: {
        fontSize: supportTextSize,
        lineHeight: supportTextLineHeight,
        marginTop: clamp(Math.round(10 * mapPermissionScale), 6, 10),
      },
      button: {
        marginTop: clamp(Math.round(18 * mapPermissionScale), 10, 18),
      },
      buttonText: {
        fontSize: buttonSize,
        lineHeight: buttonLineHeight,
      },
      helpToggle: {
        marginTop: clamp(Math.round(12 * mapPermissionScale), 8, 12),
        paddingHorizontal: clamp(Math.round(14 * mapPermissionScale), 10, 14),
        paddingVertical: clamp(Math.round(12 * mapPermissionScale), 8, 12),
      },
      helpToggleText: {
        fontSize: toggleSize,
        lineHeight: toggleLineHeight,
      },
      helpCard: {
        marginTop: clamp(Math.round(10 * mapPermissionScale), 8, 10),
        paddingHorizontal: clamp(Math.round(14 * mapPermissionScale), 10, 14),
        paddingVertical: clamp(Math.round(14 * mapPermissionScale), 10, 14),
        gap: clamp(Math.round(8 * mapPermissionScale), 6, 8),
      },
      helpStep: {
        fontSize: hintSize,
        lineHeight: hintLineHeight,
      },
      helpEmphasis: {
        fontSize: hintSize,
        lineHeight: hintLineHeight,
      },
      helpNote: {
        fontSize: hintSize,
        lineHeight: hintLineHeight,
      },
      notice: {
        marginTop: clamp(Math.round(14 * mapPermissionScale), 10, 14),
      },
    };
  }, [mapPermissionScale]);
  const plannedDurationMinutes = useMemo(() => {
    if (plan?.suggestedDurationMinutes && plan.suggestedDurationMinutes > 0) {
      return plan.suggestedDurationMinutes;
    }
    if (displayedSnapshot?.targetDurationMinutes && displayedSnapshot.targetDurationMinutes > 0) {
      return displayedSnapshot.targetDurationMinutes;
    }
    return null;
  }, [displayedSnapshot?.targetDurationMinutes, plan?.suggestedDurationMinutes]);
  const hasReachedPlannedDuration = hasLiveSession &&
    plannedDurationMinutes != null &&
    activeSeconds >= plannedDurationMinutes * 60;
  const remainingSeconds = useMemo(() => {
    const elapsedSeconds = hasLiveSession ? activeSeconds : 0;
    if (!plan) return elapsedSeconds;
    return Math.max(0, plan.suggestedDurationMinutes * 60 - elapsedSeconds);
  }, [activeSeconds, hasLiveSession, plan]);
  const canLeaveWalkScreenWithoutEnding = isAndroidService && sessionStarted;

  useEffect(() => {
    if (canShowMap) return undefined;

    let cancelled = false;
    const pollPermissionState = () => {
      if (cancelled) return;
      if (appStateRef.current !== 'active') return;
      void syncForegroundLocationAccess();
    };

    pollPermissionState();
    const intervalId = setInterval(pollPermissionState, 1200);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [canShowMap, syncForegroundLocationAccess]);

  useEffect(() => {
    if (steps === prevStepsRef.current || steps === 0) return;
    prevStepsRef.current = steps;
    animateMetricScale(stepScaleAnim, STEP_METRIC_SCALE);
  }, [animateMetricScale, stepScaleAnim, steps]);

  useEffect(() => {
    if (distanceMeters === prevDistanceRef.current || distanceMeters === 0) return;
    prevDistanceRef.current = distanceMeters;
    animateMetricScale(distanceScaleAnim, DISTANCE_METRIC_SCALE);
  }, [animateMetricScale, distanceMeters, distanceScaleAnim]);

  // Keep live metric updates subtle so numbers feel steady instead of bouncy.
  useEffect(() => {
    const currentSpeed = computeSpeedMph(distanceMeters, activeSeconds);
    if (currentSpeed === prevSpeedRef.current) return;
    prevSpeedRef.current = currentSpeed;
    animateMetricScale(speedScaleAnim, SPEED_METRIC_SCALE);
  }, [activeSeconds, animateMetricScale, distanceMeters, speedScaleAnim]);

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

  // Pulsing dot on status pill while walking / calibrating
  useEffect(() => {
    if (displayState !== 'walking' && displayState !== 'calibrating') {
      statusPulseAnim.setValue(0);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(statusPulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [displayState, statusPulseAnim]);

  // Milestone haptic feedback every 100 steps
  useEffect(() => {
    if (steps === 0) return;
    const currentMilestone = Math.floor(steps / 100) * 100;
    if (currentMilestone > lastMilestoneRef.current && currentMilestone > 0) {
      lastMilestoneRef.current = currentMilestone;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      }
    }
  }, [steps]);

  useEffect(() => {
    setPlannedDurationNoticeDismissed(false);
    durationReachedHapticSentRef.current = false;
  }, [liveSessionId]);

  useEffect(() => {
    if (!hasReachedPlannedDuration) {
      durationReachedHapticSentRef.current = false;
      return;
    }
    if (durationReachedHapticSentRef.current || Platform.OS === 'web') {
      return;
    }
    durationReachedHapticSentRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
  }, [hasReachedPlannedDuration]);

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
    setSessionStarted(Boolean(snapshot));
    if (snapshot) {
      setStartupError(null);
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
    try {
      const snapshot = await androidWalkTracking.getSnapshot();
      applyAndroidSnapshot(snapshot);
    } catch (error) {
      if (__DEV__) console.warn('Failed to refresh walk snapshot:', error);
    }
  }, [applyAndroidSnapshot, isAndroidService]);

  useEffect(() => {
    if (!isAndroidService) return;

    let cancelled = false;
    const subscription = androidWalkTracking.subscribe((snapshot) => {
      if (cancelled) return;
      applyAndroidSnapshot(snapshot);
    });

    void (async () => {
      let snapshot: ActiveWalkSnapshot | null = null;
      try {
        snapshot = await androidWalkTracking.getSnapshot();
      } catch (error) {
        if (__DEV__) console.warn('Failed to fetch active walk snapshot:', error);
      }
      if (cancelled) return;

      if (snapshot) {
        if (!planId || snapshot.planId === planId) {
          await markPlanStarted();
        }
        applyAndroidSnapshot(snapshot);
        setIsStartingWalk(false);
        startFlowLockedRef.current = false;
        return;
      }

      if (prompt === 'end_confirmation') {
        setIsStartingWalk(false);
        startFlowLockedRef.current = false;
        return;
      }

      if (androidAutoStartAttemptedRef.current) {
        return;
      }
      androidAutoStartAttemptedRef.current = true;

      startFlowLockedRef.current = true;
      setStartupError(null);
      setIsStartingWalk(true);

      try {
        await requestWalkPermissionsForStart();
        if (cancelled) return;
        await syncForegroundLocationAccess();
        if (cancelled) return;

        const shouldSkipCountdown = skipInitialStartCountdownRef.current;
        skipInitialStartCountdownRef.current = false;
        runOrSkipStartCountdown(shouldSkipCountdown, () => {
          if (cancelled) return;
          void (async () => {
            try {
              const freshSnapshot = await startAndroidSession();
              if (!freshSnapshot) {
                throw new Error('Walk tracking session did not start.');
              }
              if (cancelled) return;
              await markPlanStarted();
              applyAndroidSnapshot(freshSnapshot);
              setStartupError(null);
            } catch (error) {
              if (cancelled) return;
              clearStartCountdown();
              startFlowLockedRef.current = false;
              setStartCountdown(null);
              setIsStartingWalk(false);
              setSessionStarted(false);
              if (__DEV__) console.warn('Failed to start walk session:', error);
              setStartupError(resolveStartupErrorMessage(error));
              return;
            } finally {
              startFlowLockedRef.current = false;
              if (!cancelled && isMountedRef.current) {
                setIsStartingWalk(false);
              }
            }
          })();
        });
      } catch (error) {
        if (cancelled) return;
        clearStartCountdown();
        startFlowLockedRef.current = false;
        setStartCountdown(null);
        setIsStartingWalk(false);
        setSessionStarted(false);
        if (__DEV__) console.warn('Failed to start walk session:', error);
        setStartupError(resolveStartupErrorMessage(error));
      }
    })();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (previousState.match(/background|inactive/) && nextState === 'active') {
        void syncForegroundLocationAccess();
        void refreshAndroidSnapshot();
      }
    });

    return () => {
      cancelled = true;
      clearStartCountdown();
      androidAutoStartAttemptedRef.current = false;
      startFlowLockedRef.current = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [applyAndroidSnapshot, clearStartCountdown, isAndroidService, markPlanStarted, prompt, refreshAndroidSnapshot, requestWalkPermissionsForStart, runOrSkipStartCountdown, startAndroidSession, syncForegroundLocationAccess]);

  useEffect(() => {
    if (!isAndroidService || !foregroundLocationAccess.granted) {
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
            if (typeof location.coords.heading === 'number' && location.coords.heading >= 0) {
              setLiveHeading(location.coords.heading);
            }
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
  }, [foregroundLocationAccess.granted, isAndroidService]);

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
              ? 'Location off'
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

  const applyFallbackPermissionResults = useCallback((
    permissionResults: WalkTrackingPermissionResults,
    warningOverride?: string | null,
  ) => {
    updateFallbackState((current) => {
      const nextState = {
        ...current,
        locationPermissionGranted: permissionResults.locationForeground,
        backgroundLocationGranted: permissionResults.locationBackground,
        activityPermissionGranted: permissionResults.activityRecognition,
        warning: warningOverride ?? (
          permissionResults.locationForeground && !permissionResults.locationBackground
            ? 'Background location is off. Distance updates may pause when the app is not visible.'
            : null
        ),
      };
      return hydrateFallbackState(nextState, Date.now());
    });
  }, [hydrateFallbackState, updateFallbackState]);

  const handleStartupFailure = useCallback((error: unknown) => {
    clearStartCountdown();
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    pedometerSubscriptionRef.current?.remove();
    pedometerSubscriptionRef.current = null;
    startFlowLockedRef.current = false;
    setStartCountdown(null);
    setIsStartingWalk(false);
    setSessionStarted(false);
    if (__DEV__) console.warn('Failed to start walk session:', error);
    if (!isMountedRef.current) return;
    setStartupError(resolveStartupErrorMessage(error));
  }, [clearStartCountdown]);

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

    try {
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
    } catch (error) {
      if (__DEV__) console.warn('Pedometer subscription failed:', error);
    }
  }, [hydrateFallbackState, updateFallbackState]);

  const subscribeFallbackLocationUpdates = useCallback(async () => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

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
        if (typeof location.coords.heading === 'number' && location.coords.heading >= 0) {
          setLiveHeading(location.coords.heading);
        }
        const timestampMs = typeof location.timestamp === 'number' ? location.timestamp : Date.now();
        const previous = lastCoordRef.current;
        lastCoordRef.current = { coord: nextCoord, timestampMs };

        setRouteCoords((prev) => [...prev, nextCoord]);

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
  }, [hydrateFallbackState, updateFallbackState]);

  const refreshFallbackPermissionState = useCallback(async () => {
    const status = await getWalkTrackingPermissionStatus();
    if (!isMountedRef.current) return;
    applyFallbackPermissionResults(status);

    if (!status.locationForeground) {
      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
      setLiveLocation(null);
      setLiveHeading(0);
    } else if (sessionStarted && !locationSubscriptionRef.current) {
      try {
        await subscribeFallbackLocationUpdates();
      } catch (error) {
        if (__DEV__) console.warn('Failed to resume fallback location updates:', error);
        applyFallbackPermissionResults(
          status,
          'GapWalk could not resume live location updates. Check location services and try again.',
        );
      }
    }

    if (!status.activityRecognition) {
      pedometerSubscriptionRef.current?.remove();
      pedometerSubscriptionRef.current = null;
    } else if (
      sessionStarted &&
      !fallbackStateRef.current.paused &&
      !pedometerSubscriptionRef.current
    ) {
      subscribeFallbackPedometer();
    }
  }, [applyFallbackPermissionResults, sessionStarted, subscribeFallbackLocationUpdates, subscribeFallbackPedometer]);

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
    lastCheckpointBucketRef.current = 0;

    const resolvedPermissions = permissionResults ?? await requestWalkPermissionsForStart();
    applyFallbackPermissionResults(resolvedPermissions);

    if (resolvedPermissions.locationForeground) {
      try {
        await subscribeFallbackLocationUpdates();
      } catch (error) {
        applyFallbackPermissionResults(
          resolvedPermissions,
          'GapWalk could not start live location updates. Check location services and try again.',
        );
        throw error;
      }
    }

    if (resolvedPermissions.activityRecognition) {
      subscribeFallbackPedometer();
    }

    if (isNotificationsSupported && Platform.OS !== 'android') {
      await notificationService.setupWalkSessionCategories();
      await notificationService.showWalkSessionNotification({
        elapsedSeconds: 0,
        isPaused: false,
        targetDurationMinutes: plan?.suggestedDurationMinutes ?? null,
        startedFromNotification,
        timerMode: notificationTimerMode,
        statsMode: notificationStatsMode,
        steps: 0,
        distanceMeters: 0,
        distanceUnit,
      });
    }
  }, [
    applyFallbackPermissionResults,
    hydrateFallbackState,
    notificationTimerMode,
    plan?.suggestedDurationMinutes,
    requestWalkPermissionsForStart,
    startedFromNotification,
    subscribeFallbackPedometer,
    subscribeFallbackLocationUpdates,
    unsubscribeFallbackSensors,
    updateFallbackState,
  ]);

  const beginAndroidWalk = useCallback(async (options?: { skipCountdown?: boolean }) => {
    if (!isAndroidService || startFlowLockedRef.current) return;

    startFlowLockedRef.current = true;
    setStartupError(null);
    setIsStartingWalk(true);

    try {
      await requestWalkPermissionsForStart();
      if (!isMountedRef.current) return;

      const shouldSkipCountdown = options?.skipCountdown === true;
      skipInitialStartCountdownRef.current = false;
      runOrSkipStartCountdown(shouldSkipCountdown, () => {
        void (async () => {
          try {
            const freshSnapshot = await startAndroidSession();
            if (!freshSnapshot) {
              throw new Error('Walk tracking session did not start.');
            }
            if (!isMountedRef.current) return;
            await markPlanStarted();
            applyAndroidSnapshot(freshSnapshot);
            setStartupError(null);
          } catch (error) {
            handleStartupFailure(error);
            return;
          } finally {
            startFlowLockedRef.current = false;
            if (isMountedRef.current) {
              setIsStartingWalk(false);
            }
          }
        })();
      });
    } catch (error) {
      handleStartupFailure(error);
    }
  }, [applyAndroidSnapshot, handleStartupFailure, isAndroidService, markPlanStarted, requestWalkPermissionsForStart, runOrSkipStartCountdown, startAndroidSession]);

  const beginFallbackWalk = useCallback(async (options?: { skipCountdown?: boolean }) => {
    if (isAndroidService || startFlowLockedRef.current) return;

    startFlowLockedRef.current = true;
    setStartupError(null);
    setIsStartingWalk(true);

    try {
      const permissionResults = await requestWalkPermissionsForStart();
      if (!isMountedRef.current) return;
      await syncForegroundLocationAccess();
      if (!isMountedRef.current) return;

      applyFallbackPermissionResults(permissionResults);

      const shouldSkipCountdown = options?.skipCountdown === true;
      skipInitialStartCountdownRef.current = false;
      runOrSkipStartCountdown(shouldSkipCountdown, () => {
        void (async () => {
          try {
            await startFallbackTracking(permissionResults);
            if (!isMountedRef.current) return;
            setSessionStarted(true);
            await markPlanStarted();
            setStartupError(null);
          } catch (error) {
            handleStartupFailure(error);
            return;
          } finally {
            startFlowLockedRef.current = false;
            if (isMountedRef.current) {
              setIsStartingWalk(false);
            }
          }
        })();
      });
    } catch (error) {
      handleStartupFailure(error);
    }
  }, [applyFallbackPermissionResults, handleStartupFailure, isAndroidService, markPlanStarted, requestWalkPermissionsForStart, runOrSkipStartCountdown, startFallbackTracking]);

  const handleRetryStart = useCallback(async () => {
    if (hasLiveSession || isStartingWalk || startCountdown != null) return;

    if (isAndroidService) {
      await beginAndroidWalk();
      return;
    }
    await beginFallbackWalk();
  }, [
    beginAndroidWalk,
    beginFallbackWalk,
    hasLiveSession,
    isAndroidService,
    isStartingWalk,
    startCountdown,
  ]);

  useEffect(() => {
    if (isAndroidService) return;

    void beginFallbackWalk({ skipCountdown: skipInitialStartCountdownRef.current });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (previousState.match(/background|inactive/) && nextState === 'active') {
        void syncForegroundLocationAccess();
        void refreshFallbackPermissionState();
      }
    });

    return () => {
      clearStartCountdown();
      startFlowLockedRef.current = false;
      appStateSubscription.remove();
      unsubscribeFallbackSensors();
      if (isNotificationsSupported && Platform.OS !== 'android') {
        void notificationService.dismissWalkSessionNotification();
      }
    };
  }, [beginFallbackWalk, clearStartCountdown, isAndroidService, refreshFallbackPermissionState, syncForegroundLocationAccess, unsubscribeFallbackSensors]);

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
        void notificationService.showWalkSessionNotification({
          elapsedSeconds: fallbackStateRef.current.activeSeconds,
          isPaused: fallbackStateRef.current.paused,
          targetDurationMinutes: plan?.suggestedDurationMinutes ?? null,
          startedFromNotification,
          timerMode: notificationTimerMode,
          statsMode: notificationStatsMode,
          steps: fallbackStateRef.current.steps,
          distanceMeters: fallbackStateRef.current.distanceMeters,
          distanceUnit,
        });
      }

      if (!fallbackStateRef.current.paused) {
        const checkpointBucket = Math.floor(fallbackStateRef.current.activeSeconds / 30);
        if (checkpointBucket > lastCheckpointBucketRef.current) {
          lastCheckpointBucketRef.current = checkpointBucket;
          void updateFallbackCheckpoint();
        }
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [
    computeFallbackElapsedSeconds,
    hydrateFallbackState,
    isAndroidService,
    notificationTimerMode,
    notificationStatsMode,
    plan?.suggestedDurationMinutes,
    sessionStarted,
    startedFromNotification,
    distanceUnit,
    updateFallbackCheckpoint,
    updateFallbackState,
  ]);

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
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !sessionStarted || canLeaveWalkScreenWithoutEnding) return;
      event.preventDefault();
      setShowIdleModal(false);
      setShowEndModal(true);
    });
    return unsubscribe;
  }, [canLeaveWalkScreenWithoutEnding, navigation, sessionStarted]);

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
      navigation.navigate('Dashboard', {
        postWalkSessionId: completionSessionId ?? undefined,
      });
    });
  }, [completionBackdropAnim, completionCardAnim, completionGlowAnim, completionSessionId, completionStatAnims, navigation, showCompletion]);

  const persistCompletedSession = useCallback(async (
    session: WalkSession,
    options?: {
      planStatus?: 'completed' | 'cancelled' | 'skipped';
      endReason?: 'manual' | 'idle_later';
      hadWalkingSignal?: boolean;
      showCompletion?: boolean;
    },
  ) => {
    const resolvedSession = await persistCompletedWalkSession(session, {
      planStatus: options?.planStatus,
      endReason: options?.endReason,
      hadWalkingSignal: options?.hadWalkingSignal,
    });

    if (!isAndroidService) {
      await clearWalkCheckpoint();
      if (isNotificationsSupported && Platform.OS !== 'android') {
        await notificationService.dismissWalkSessionNotification();
      }
    }

    setCompletionSessionId(resolvedSession.id);
    setCompletionKind(options?.endReason === 'idle_later' ? 'saved_later' : 'completed');
    setCompletionStats({
      activeSeconds: resolvedSession.activeSeconds,
      distanceMeters: resolvedSession.distanceMeters ?? 0,
      steps: resolvedSession.steps ?? 0,
    });

    if (options?.showCompletion === false) {
      allowLeaveRef.current = true;
      navigation.navigate('Dashboard', {
        showPostWalkSummary: true,
        postWalkSessionId: resolvedSession.id,
      });
      return resolvedSession;
    }

    setShowCompletion(true);
    return resolvedSession;
  }, [isAndroidService, navigation]);

  const saveAndroidSession = useCallback(async (
    snapshot: ActiveWalkSnapshot | null,
    options?: {
      planStatus?: 'completed' | 'cancelled' | 'skipped';
      endReason?: 'manual' | 'idle_later';
      showCompletion?: boolean;
    },
  ) => {
    if (!snapshot) return null;
    const pauseDelta = snapshot.pauseStartedAtMs ? Date.now() - snapshot.pauseStartedAtMs : 0;
    const sessionEndMs = Date.now();
    const pauseEvents = await pauseEventsRepo.getBySessionId(snapshot.sessionId);

    const session = buildWalkSessionFromAndroidCompletion({
      sessionId: snapshot.sessionId,
      planId: snapshot.planId || planId,
      startIso: snapshot.startIso,
      endIso: new Date(sessionEndMs).toISOString(),
      activeSeconds: computeSnapshotElapsedSeconds(snapshot, sessionEndMs),
      pausedSeconds: Math.floor((snapshot.totalPausedMs + pauseDelta) / 1000),
      distanceMeters: snapshot.distanceMeters,
      steps: snapshot.steps,
      usedLocation: snapshot.usedLocation,
      stepSource: snapshot.stepSource,
      motionConfidence: snapshot.motionConfidence,
      sensorHealthAtStart: snapshot.pedometerHealth,
      hadWalkingSignal: snapshot.hadWalkingSignal,
      distanceUnit: snapshot.distanceUnit === 'mi' ? 'mi' : 'km',
    }, {
      pauseCount: pauseEvents.length,
      fallbackPlanId: planId,
      plan,
    });

    setActiveWalkSnapshot(null);
    setPendingWalkPrompt(null);
    return persistCompletedSession(session, {
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
    return persistCompletedSession(session, {
      ...options,
      hadWalkingSignal: current.hadWalkingSignal,
    });
  }, [computeFallbackElapsedSeconds, persistCompletedSession, plan, planId, unsubscribeFallbackSensors]);

  const togglePause = useCallback(async () => {
    setShowIdleModal(false);

    if (!hasLiveSession || isStartingWalk || startCountdown != null) return;

    try {
      if (isAndroidService) {
        const snapshot = paused
          ? await androidWalkTracking.resumeSession('screen')
          : await androidWalkTracking.pauseSession('screen');
        applyAndroidSnapshot(snapshot);
        if (!snapshot) {
          setStartupError(WALK_STATE_UPDATE_ERROR_MESSAGE);
        }
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
    } catch (error) {
      if (__DEV__) console.warn('Failed to update walk pause state:', error);
      setStartupError(WALK_STATE_UPDATE_ERROR_MESSAGE);
      if (isAndroidService) {
        await refreshAndroidSnapshot();
      }
    }
  }, [
    applyAndroidSnapshot,
    hasLiveSession,
    hydrateFallbackState,
    isAndroidService,
    isStartingWalk,
    paused,
    refreshAndroidSnapshot,
    startCountdown,
    subscribeFallbackPedometer,
    updateFallbackCheckpoint,
    updateFallbackState,
  ]);

  const continueAfterIdlePause = useCallback(async () => {
    setShowIdleModal(false);
    try {
      if (isAndroidService) {
        const snapshot = await androidWalkTracking.resumeSession('screen');
        applyAndroidSnapshot(snapshot);
        if (!snapshot) {
          setStartupError(WALK_STATE_UPDATE_ERROR_MESSAGE);
        }
        return;
      }
      await togglePause();
    } catch (error) {
      if (__DEV__) console.warn('Failed to resume walk after idle pause:', error);
      setStartupError(WALK_STATE_UPDATE_ERROR_MESSAGE);
      if (isAndroidService) {
        await refreshAndroidSnapshot();
      }
    }
  }, [applyAndroidSnapshot, isAndroidService, refreshAndroidSnapshot, togglePause]);

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
    const endedFromNotificationPrompt =
      prompt === 'end_confirmation' ||
      pendingWalkPrompt === 'end_confirmation' ||
      activeWalkSnapshot?.prompt === 'end_confirmation';
    const isQuickEnd = endedFromNotificationPrompt && endWalkMode === 'quick';
    if (isAndroidService) {
      const snapshot = await androidWalkTracking.confirmEndSession();
      const resolvedSession = await saveAndroidSession(snapshot, {
        showCompletion: !endedFromNotificationPrompt,
      });
      if (isQuickEnd && resolvedSession && isNotificationsSupported) {
        await notificationService.showPostWalkSummaryNotification({
          sessionId: resolvedSession.id,
          durationSeconds: resolvedSession.activeSeconds,
          steps: resolvedSession.steps ?? 0,
          distanceMeters: resolvedSession.distanceMeters ?? 0,
          distanceUnit,
        });
      }
      return;
    }
    const resolvedSession = await saveFallbackSession({
      showCompletion: !endedFromNotificationPrompt,
    });
    if (isQuickEnd && resolvedSession && isNotificationsSupported) {
      await notificationService.showPostWalkSummaryNotification({
        sessionId: resolvedSession.id,
        durationSeconds: resolvedSession.activeSeconds,
        steps: resolvedSession.steps ?? 0,
        distanceMeters: resolvedSession.distanceMeters ?? 0,
        distanceUnit,
      });
    }
  }, [activeWalkSnapshot?.prompt, distanceUnit, endWalkMode, isAndroidService, pendingWalkPrompt, prompt, saveAndroidSession, saveFallbackSession]);

  // Handle end_confirmation prompt — must be after confirmEnd declaration
  useEffect(() => {
    if (prompt === 'end_confirmation' || pendingWalkPrompt === 'end_confirmation') {
      setShowIdleModal(false);
      if (endWalkMode === 'quick') {
        void confirmEnd();
      } else {
        setShowEndModal(true);
      }
    }
  }, [confirmEnd, endWalkMode, pendingWalkPrompt, prompt]);

  const closeEndModal = useCallback(async () => {
    if (isAndroidService) {
      if (activeWalkSnapshot?.prompt === 'end_confirmation') {
        const snapshot = await androidWalkTracking.cancelEndConfirmation();
        applyAndroidSnapshot(snapshot);
      }
      // Auto-resume if paused due to end walk action
      if (
        activeWalkSnapshot?.paused &&
        (
          activeWalkSnapshot.lastActionSource === 'end_walk_notification' ||
          activeWalkSnapshot.lastActionSource === 'end_walk_screen'
        )
      ) {
        const snapshot = await androidWalkTracking.resumeSession('end_cancel');
        applyAndroidSnapshot(snapshot);
      }
    } else {
      // JS fallback: resume if paused.
      const current = fallbackStateRef.current;
      if (current.paused) {
        await togglePause();
      }
    }
    setShowEndModal(false);
  }, [activeWalkSnapshot?.lastActionSource, activeWalkSnapshot?.paused, activeWalkSnapshot?.prompt, applyAndroidSnapshot, isAndroidService, togglePause]);

  const handleEndWalkPress = useCallback(async () => {
    // Pause timer immediately when End Walk is pressed from in-app button
    if (!paused) {
      if (isAndroidService) {
        const snapshot = await androidWalkTracking.pauseSession('end_walk_screen');
        applyAndroidSnapshot(snapshot);
      } else {
        await togglePause();
      }
    }
    setShowEndModal(true);
  }, [applyAndroidSnapshot, isAndroidService, paused, togglePause]);

  const handleLocatePress = useCallback(async () => {
    try {
      const permissionState = await syncForegroundLocationAccess();
      if (!permissionState.granted) return;

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coord: Coord = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setLiveLocation(coord);
      if (typeof location.coords.heading === 'number' && location.coords.heading >= 0) {
        setLiveHeading(location.coords.heading);
      }
      setIsMapFollowingUser(true);
      lastFollowAnimateAtRef.current = Date.now();
      centerMapOnCoord(coord, 800);
    } catch {
      // Ignore locate failures; permission/warning UI already handles guidance.
    }
  }, [centerMapOnCoord, syncForegroundLocationAccess]);

  const handleLeaveWalkingScreen = useCallback(() => {
    setShowIdleModal(false);
    setShowEndModal(false);

    if (navigation.canGoBack()) {
      allowLeaveRef.current = true;
      navigation.goBack();
      return;
    }

    navigation.navigate('Dashboard', {});
  }, [navigation]);

  const openAppSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      if (__DEV__) console.warn('Failed to open app settings:', error);
    }
  }, []);

  const handleRequestMapAccess = useCallback(() => {
    void (async () => {
      const permissionState = await syncForegroundLocationAccess();
      if (permissionState.granted) return;
      await openAppSettings();
    })();
  }, [openAppSettings, syncForegroundLocationAccess]);

  const handleEnableBackgroundTracking = useCallback(() => {
    if (Platform.OS !== 'android' || isRequestingBackgroundUpgrade) return;

    void (async () => {
      setIsRequestingBackgroundUpgrade(true);
      try {
        const granted = await requestBackgroundWalkTrackingPermission({
          confirmDisclosure: requestBackgroundDisclosureConfirmation,
        });
        if (!granted) return;

        if (isAndroidService) {
          await refreshAndroidSnapshot();
          return;
        }

        await refreshFallbackPermissionState();
      } finally {
        if (isMountedRef.current) {
          setIsRequestingBackgroundUpgrade(false);
        }
      }
    })();
  }, [
    isAndroidService,
    isRequestingBackgroundUpgrade,
    refreshAndroidSnapshot,
    refreshFallbackPermissionState,
    requestBackgroundDisclosureConfirmation,
  ]);

  const statusColor = useMemo(() => {
    if (displayState === 'paused') return '#f59e0b';
    if (displayState === 'walking') return palette.accentPrimary;
    return themeMode === 'dark' ? '#94a3b8' : '#475569';
  }, [displayState, palette.accentPrimary, themeMode]);

  const statusTint = useMemo(() => {
    if (displayState === 'paused') return 'rgba(245,158,11,0.14)';
    if (displayState === 'walking') return themeMode === 'dark' ? 'rgba(46,233,166,0.14)' : 'rgba(5,150,105,0.12)';
    return themeMode === 'dark' ? 'rgba(139,155,189,0.12)' : 'rgba(71,85,105,0.10)';
  }, [displayState, themeMode]);

  const statusBorderColor = useMemo(() => {
    if (displayState === 'walking') return themeMode === 'dark' ? 'rgba(46,233,166,0.30)' : 'rgba(5,150,105,0.24)';
    if (displayState === 'paused') return 'rgba(245,158,11,0.28)';
    return palette.borderSoft;
  }, [displayState, palette.borderSoft, themeMode]);

  const heroStatusLabel = hasStartupIssue
    ? 'Walk not started'
    : displayLabel(displayState);
  const statusDisplayColor = hasStartupIssue ? '#ef4444' : statusColor;
  const statusDisplayTint = hasStartupIssue
    ? 'rgba(239,68,68,0.12)'
    : statusTint;
  const statusDisplayBorderColor = hasStartupIssue
    ? 'rgba(239,68,68,0.24)'
    : statusBorderColor;
  const speedMph = computeSpeedMph(distanceMeters, activeSeconds);
  const activeTimerParts = getTimerDisplayParts(activeSeconds);
  const remainingTimerParts = getTimerDisplayParts(remainingSeconds);

  const hideClutterRules = [
    { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape.man_made', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];

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
    ...hideClutterRules,
  ];

  const lightMapStyle = [...hideClutterRules];

  const renderMetricCard = useCallback((cardId: WalkDisplayCard) => {
    if (cardId === 'walkDuration') {
      if (!hasLiveSession) {
        return (
          <WalkMetricCard
            key={cardId}
            palette={palette}
            label="Walk Duration"
            value={(
              <View style={styles.metricFaceWrap}>
                <Text style={[styles.metricClockFront, styles.metricClockPlaceholder]}>
                  --:--
                </Text>
                <Text variant="bodySmall" color={palette.textMuted}>
                  Start your walk to see live time
                </Text>
              </View>
            )}
          />
        );
      }

      const frontRotation = flipAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0deg', '90deg', '180deg'],
      });
      const backRotation = flipAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['180deg', '270deg', '360deg'],
      });
      const frontOpacity = flipAnim.interpolate({
        inputRange: [0, 0.49, 0.51, 1],
        outputRange: [1, 1, 0, 0],
      });
      const backOpacity = flipAnim.interpolate({
        inputRange: [0, 0.49, 0.51, 1],
        outputRange: [0, 0, 1, 1],
      });

      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label={isFlipped ? 'Time Remaining' : 'Walk Duration'}
          onPress={hasLiveSession ? toggleFlip : undefined}
          value={
            <View style={styles.metricFaceWrap}>
              <Animated.View
                style={[
                  styles.flipFace,
                  { transform: [{ perspective: 800 }, { rotateY: frontRotation }], opacity: frontOpacity },
                ]}
                pointerEvents={isFlipped ? 'none' : 'auto'}
              >
                <View style={styles.metricClockValueWrap}>
                  <View style={styles.metricClockFrame}>
                    <View style={styles.metricClockRow}>
                      <Text style={styles.metricDigitalClock}>{activeTimerParts.lead}</Text>
                      <Text style={styles.metricDigitalClock}>:</Text>
                      <Text style={styles.metricDigitalClock}>{activeTimerParts.trailing}</Text>
                    </View>
                  </View>
                </View>
                <Text variant="bodySmall" color={palette.textMuted} style={[styles.metricFlipHint, styles.metricFlipHintFront]}>Tap to flip</Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.flipFace,
                  styles.flipFaceBack,
                  { transform: [{ perspective: 800 }, { rotateY: backRotation }], opacity: backOpacity },
                ]}
                pointerEvents={isFlipped ? 'auto' : 'none'}
              >
                <View style={styles.metricClockValueWrap}>
                  <View style={styles.metricClockFrame}>
                    {plan ? (
                      <View style={styles.metricClockRow}>
                        <Text style={styles.metricDigitalClock}>{remainingTimerParts.lead}</Text>
                        <Animated.View style={{ opacity: clockColonAnim }}>
                          <Text style={styles.metricDigitalClock}>:</Text>
                        </Animated.View>
                        <Text style={styles.metricDigitalClock}>{remainingTimerParts.trailing}</Text>
                      </View>
                    ) : (
                      <Text style={styles.metricClockStandalone}>N/A</Text>
                    )}
                  </View>
                </View>
                <Text variant="bodySmall" color={palette.textMuted} style={styles.metricFlipHint}>
                  {plan ? 'Remaining in this walk window' : 'No active plan window'}
                </Text>
              </Animated.View>
            </View>
          }
        />
      );
    }

    if (cardId === 'steps') {
      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label="Steps"
          centerValue
          value={(
            <Animated.View style={{ transform: [{ scale: stepScaleAnim }] }}>
              <Text style={[styles.metricValue, styles.metricValueCentered, styles.metricValueSteps]}>{steps.toLocaleString()}</Text>
            </Animated.View>
          )}
        />
      );
    }

    if (cardId === 'distance') {
      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label="Distance"
          centerValue
          value={(
            <Animated.View style={{ transform: [{ scale: distanceScaleAnim }] }}>
              <Text style={[styles.metricValue, styles.metricValueCentered]}>{formatMiles(distanceMeters)}</Text>
            </Animated.View>
          )}
        />
      );
    }

    if (cardId === 'speed') {
      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label="Speed"
          centerValue
          value={(
            <Animated.View style={{ transform: [{ scale: speedScaleAnim }] }}>
              <Text style={[styles.metricValue, styles.metricValueCentered]}>{speedMph} mph</Text>
            </Animated.View>
          )}
        />
      );
    }

    if (cardId === 'calories') {
      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label="Calories"
          centerValue
          value={<Text style={[styles.metricValue, styles.metricValueCentered]}>{Math.round(steps * 0.04)} kcal</Text>}
        />
      );
    }

    if (cardId === 'goalProgress') {
      const goalPct = preferences?.stepGoalEnabled && preferences.stepGoal > 0
        ? `${Math.min(100, Math.round((steps / preferences.stepGoal) * 100))}%`
        : 'N/A';
      return (
        <WalkMetricCard
          key={cardId}
          palette={palette}
          label="Goal Progress"
          centerValue
          value={<Text style={[styles.metricValue, styles.metricValueCentered]}>{goalPct}</Text>}
        />
      );
    }

    return null;
  }, [
    activeSeconds,
    clockColonAnim,
    distanceMeters,
    flipAnim,
    hasLiveSession,
    isFlipped,
    palette,
    plan,
    preferences?.stepGoal,
    preferences?.stepGoalEnabled,
    remainingTimerParts.lead,
    remainingTimerParts.trailing,
    speedMph,
    stepScaleAnim,
    steps,
    distanceScaleAnim,
    speedScaleAnim,
    toggleFlip,
  ]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { backgroundColor: palette.bgSurface, borderBottomColor: palette.borderSoft }]}>
        <WalkingBackButton palette={palette} onPress={handleLeaveWalkingScreen} />
        <Text variant="title" style={styles.topBarTitle}>Walking</Text>
        <View style={styles.topBarBtnPlaceholder} />
      </View>

      <View style={styles.body}>
        <View style={[styles.mapContainer, { backgroundColor: palette.bgSurface }]}>
          {canShowMap ? (
            <>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                onPanDrag={() => setIsMapFollowingUser((current) => (current ? false : current))}
                showsMyLocationButton={false}
                showsCompass={false}
                showsTraffic={false}
                showsIndoorLevelPicker={false}
                showsIndoors={false}
                toolbarEnabled={false}
                customMapStyle={themeMode === 'dark' ? darkMapStyle : lightMapStyle}
              >
                {liveLocation && (
                  <Marker coordinate={liveLocation} anchor={{ x: 0.5, y: 0.5 }} flat>
                    <View style={[styles.userArrowOuter, { transform: [{ rotate: `${liveHeading}deg` }] }]}>
                      <View style={styles.userArrowHead} />
                      <View style={styles.userArrowDot} />
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
                  {/* Status pill removed per user request */}
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

                <View style={styles.noticeStack}>
                  {startupError && (
                    <WalkNoticeCard
                      palette={palette}
                      themeMode={themeMode}
                      iconName="alert-circle-outline"
                      title="Walk could not start"
                      message={startupError}
                      tone="danger"
                      actionLabel={isStartingWalk ? undefined : 'Retry start'}
                      onAction={() => { void handleRetryStart(); }}
                    />
                  )}
                  {locationLostMidWalk && (
                    <WalkNoticeCard
                      palette={palette}
                      themeMode={themeMode}
                      iconName="location-outline"
                      title="Location signal lost"
                      message="Distance and route tracking are paused. Time and steps still count."
                    />
                  )}
                  {backgroundTrackingLimited && (
                    <WalkNoticeCard
                      palette={palette}
                      themeMode={themeMode}
                      iconName="locate-outline"
                      title="Background tracking limited"
                      message="Distance updates may pause when GapWalk is not visible. Enable background tracking for continuous active-walk distance updates."
                      actionLabel="Enable"
                      onAction={handleEnableBackgroundTracking}
                      actionBusy={isRequestingBackgroundUpgrade}
                    />
                  )}
                  {hasReachedPlannedDuration && !plannedDurationNoticeDismissed && plannedDurationMinutes != null && (
                    <WalkNoticeCard
                      palette={palette}
                      themeMode={themeMode}
                      iconName="time-outline"
                      title="Planned walk time reached"
                      message={`You have completed the planned ${plannedDurationMinutes} min walk. Keep walking or end when you're ready.`}
                      actionLabel="End walk"
                      onAction={() => { void handleEndWalkPress(); }}
                      onDismiss={() => setPlannedDurationNoticeDismissed(true)}
                    />
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.mapPermissionGate}>
              <ScrollView
                style={styles.mapPermissionScroll}
                contentContainerStyle={[styles.mapPermissionScrollContent, mapPermissionCompactStyles.gate]}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
                bounces={false}
                alwaysBounceVertical={false}
                keyboardShouldPersistTaps="handled"
              >
              <View
                style={[
                  styles.mapPermissionCard,
                  mapPermissionCompactStyles.card,
                  {
                    backgroundColor: palette.bgSurfaceElevated,
                    borderColor: palette.borderSoft,
                  },
                ]}
              >
                <View
                  style={[
                    styles.mapPermissionIconWrap,
                    mapPermissionCompactStyles.iconWrap,
                    {
                      backgroundColor: themeMode === 'dark' ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.10)',
                      borderColor: themeMode === 'dark' ? 'rgba(59,130,246,0.28)' : 'rgba(59,130,246,0.18)',
                    },
                  ]}
                >
                  <Ionicons name="location-outline" size={clamp(Math.round(24 * mapPermissionScale), 18, 24)} color={palette.accentPrimary} />
                </View>
                <Text
                  variant="title"
                  style={[styles.mapPermissionTitle, mapPermissionCompactStyles.title]}
                  maxFontSizeMultiplier={1}
                >
                  {mapPermissionTitle}
                </Text>
                <Text
                  variant="body"
                  color={palette.textMuted}
                  style={[styles.mapPermissionMessage, mapPermissionCompactStyles.message]}
                  maxFontSizeMultiplier={1}
                >
                  {mapPermissionMessage}
                </Text>
                <Text
                  variant="body"
                  color={palette.textMuted}
                  style={[styles.mapPermissionHint, mapPermissionCompactStyles.hint]}
                  maxFontSizeMultiplier={1}
                >
                  Your walk can still continue without the map. It comes back as soon as location access is enabled.
                </Text>
                <Pressable
                  onPress={() => setShowMapPermissionHelp((current) => !current)}
                  style={({ pressed }) => [
                    styles.mapPermissionHelpToggle,
                    mapPermissionCompactStyles.helpToggle,
                    {
                      backgroundColor: palette.bgSurface,
                      borderColor: palette.borderSoft,
                    },
                    pressed && { opacity: 0.82 },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={[styles.mapPermissionHelpToggleText, mapPermissionCompactStyles.helpToggleText]}
                    maxFontSizeMultiplier={1}
                  >
                    {mapPermissionToggleLabel}
                  </Text>
                  <Ionicons
                    name={showMapPermissionHelp ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={clamp(Math.round(16 * mapPermissionScale), 14, 16)}
                    color={palette.textMuted}
                  />
                </Pressable>
                {showMapPermissionHelp ? (
                  <View
                    style={[
                      styles.mapPermissionHelpCard,
                      mapPermissionCompactStyles.helpCard,
                      {
                        backgroundColor: palette.bgSurface,
                        borderColor: palette.borderSoft,
                      },
                    ]}
                  >
                    <Text variant="bodySmall" style={[styles.mapPermissionHelpStep, mapPermissionCompactStyles.helpStep]} maxFontSizeMultiplier={1}>
                      1. Tap <Text variant="bodySmall" style={[styles.mapPermissionHelpEmphasis, mapPermissionCompactStyles.helpEmphasis]} maxFontSizeMultiplier={1}>Go to settings</Text>.
                    </Text>
                    <Text variant="bodySmall" style={[styles.mapPermissionHelpStep, mapPermissionCompactStyles.helpStep]} maxFontSizeMultiplier={1}>
                      2. Open <Text variant="bodySmall" style={[styles.mapPermissionHelpEmphasis, mapPermissionCompactStyles.helpEmphasis]} maxFontSizeMultiplier={1}>Permissions</Text>.
                    </Text>
                    <Text variant="bodySmall" style={[styles.mapPermissionHelpStep, mapPermissionCompactStyles.helpStep]} maxFontSizeMultiplier={1}>
                      3. Choose <Text variant="bodySmall" style={[styles.mapPermissionHelpEmphasis, mapPermissionCompactStyles.helpEmphasis]} maxFontSizeMultiplier={1}>Location</Text>.
                    </Text>
                    <Text variant="bodySmall" style={[styles.mapPermissionHelpStep, mapPermissionCompactStyles.helpStep]} maxFontSizeMultiplier={1}>
                      4. Select <Text variant="bodySmall" style={[styles.mapPermissionHelpEmphasis, mapPermissionCompactStyles.helpEmphasis]} maxFontSizeMultiplier={1}>Allow only while using the app</Text>.
                    </Text>
                    <Text
                      variant="bodySmall"
                      color={palette.textMuted}
                      style={[styles.mapPermissionHelpNote, mapPermissionCompactStyles.helpNote]}
                      maxFontSizeMultiplier={1}
                    >
                      Optional: choose <Text variant="bodySmall" style={[styles.mapPermissionHelpEmphasis, mapPermissionCompactStyles.helpEmphasis]} maxFontSizeMultiplier={1}>Allow all the time</Text> only if you want tracking to keep updating after locking your screen or switching apps.
                    </Text>
                  </View>
                ) : null}
                <Button
                  title={mapPermissionActionLabel}
                  onPress={handleRequestMapAccess}
                  full
                  size={mapPermissionScale < 0.9 ? 'compact' : 'default'}
                  style={[styles.mapPermissionButton, mapPermissionCompactStyles.button]}
                  textStyle={mapPermissionCompactStyles.buttonText}
                  labelNumberOfLines={1}
                  labelAdjustsFontSizeToFit
                  labelMinimumFontScale={0.82}
                  labelMaxFontSizeMultiplier={1}
                  testID="walking-map-permission-action"
                />
                {startupError && (
                  <View style={[styles.mapPermissionNotice, mapPermissionCompactStyles.notice]}>
                    <WalkNoticeCard
                      palette={palette}
                      themeMode={themeMode}
                      iconName="alert-circle-outline"
                      title="Walk could not start"
                      message={startupError}
                      tone="danger"
                      actionLabel={isStartingWalk ? undefined : 'Retry start'}
                      onAction={() => { void handleRetryStart(); }}
                    />
                  </View>
                )}
              </View>
              </ScrollView>
            </View>
          )}
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

          <View
            style={[
              styles.statusCapsule,
              {
                backgroundColor: statusDisplayTint,
                borderColor: statusDisplayBorderColor,
              },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: statusDisplayColor }]} />
            <Text variant="bodySmall" style={[styles.statusCapsuleLabel, { color: statusDisplayColor }]}>
              {heroStatusLabel}
            </Text>
          </View>

          <View style={styles.metricGrid}>
            {walkDisplayCards.map(renderMetricCard)}
          </View>

          {hasLiveSession ? (
            <View style={styles.actionRow}>
              <WalkActionButton
                palette={palette}
                label={paused ? 'Resume walk' : 'Pause walk'}
                iconName={paused ? 'play' : 'pause'}
                onPress={() => { void togglePause(); }}
                disabled={isStartingWalk || startCountdown != null}
                testID="walking-pause-resume"
              />
              <WalkActionButton
                palette={palette}
                label="End walk"
                iconName="close"
                tone="danger"
                onPress={() => { void handleEndWalkPress(); }}
                testID="walking-end"
              />
            </View>
          ) : null}
        </Animated.View>
      </View>

      <Modal
        visible={showWalkStartLocationOverlay}
        onClose={resolveWalkStartLocationOverlay}
        title="Location permission"
        dismissOnBackdropPress={false}
        dismissOnRequestClose={false}
      >
        <View
          style={[
            styles.walkStartLocationOverlayBadge,
            {
              backgroundColor: themeMode === 'dark' ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.11)',
              borderColor: themeMode === 'dark' ? 'rgba(59,130,246,0.30)' : 'rgba(59,130,246,0.22)',
            },
          ]}
        >
          <Ionicons name="navigate-outline" size={20} color={palette.accentPrimary} />
          <Text variant="bodySmall" style={[styles.walkStartLocationOverlayBadgeText, { color: palette.accentPrimary }]}>
            Setup shown once before your first walk
          </Text>
        </View>

        <Text variant="body" style={styles.walkStartLocationOverlayIntro}>
          GapWalk uses location to track your live route and distance during walks. Android permission screens are up next.
        </Text>

        <View style={styles.walkStartLocationOverlayBulletList}>
          {WALK_START_LOCATION_OPTION_POINTS.map((item) => (
            <View key={item} style={styles.walkStartLocationOverlayBulletRow}>
              <View style={[styles.walkStartLocationOverlayBulletDot, { backgroundColor: palette.accentPrimary }]} />
              <Text variant="bodySmall" color={palette.textMuted} style={styles.walkStartLocationOverlayBulletText}>
                {item}
              </Text>
            </View>
          ))}
        </View>

        <Button
          title="Got it!"
          onPress={resolveWalkStartLocationOverlay}
          full
          testID="walking-first-location-overlay-got-it"
        />
      </Modal>

      <Modal
        visible={showBackgroundDisclosureModal}
        onClose={() => resolveBackgroundDisclosure(false)}
        title="Allow background location for active walks?"
        dismissOnBackdropPress={false}
        dismissOnRequestClose={false}
      >
        <View
          style={[
            styles.backgroundDisclosureBadge,
            {
              backgroundColor: themeMode === 'dark' ? 'rgba(46,233,166,0.14)' : 'rgba(5,150,105,0.11)',
              borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.30)' : 'rgba(5,150,105,0.22)',
            },
          ]}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={palette.accentPrimary} />
          <Text variant="bodySmall" style={[styles.backgroundDisclosureBadgeText, { color: palette.accentPrimary }]}>
            Needed for continuous active walk tracking
          </Text>
        </View>

        <Text variant="body" style={styles.backgroundDisclosureIntro}>
          GapWalk collects location data to track distance during an active walk, including when the app is closed or not in use.
        </Text>

        <View style={styles.backgroundDisclosureBulletList}>
          {BACKGROUND_DISCLOSURE_BENEFIT_POINTS.map((item) => (
            <View key={item} style={styles.backgroundDisclosureBulletRow}>
              <View style={[styles.backgroundDisclosureBulletDot, { backgroundColor: palette.accentPrimary }]} />
              <Text variant="bodySmall" color={palette.textMuted} style={styles.backgroundDisclosureBulletText}>
                {item}
              </Text>
            </View>
          ))}
        </View>

        <Text variant="bodySmall" color={palette.textMuted} style={styles.backgroundDisclosureFooter}>
          Continue to open Android&apos;s permission screen.
        </Text>

        <View style={styles.modalRow}>
          <Button
            title="Not now"
            onPress={() => resolveBackgroundDisclosure(false)}
            variant="outline"
            style={styles.modalButton}
            testID="walking-background-location-disclosure-decline"
          />
          <Button
            title="Continue"
            onPress={() => resolveBackgroundDisclosure(true)}
            style={styles.modalButton}
            testID="walking-background-location-disclosure-continue"
          />
        </View>
      </Modal>

      <Modal visible={showEndModal} onClose={() => { void closeEndModal(); }} title="End this walk?">
        <Text variant="body" style={styles.modalText}>
          Your progress is safe and will be added to your dashboard.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="Keep walking"
            onPress={() => { void closeEndModal(); }}
            variant="outline"
            style={styles.modalButton}
            testID="walking-end-cancel"
          />
          <Button
            title="End walk"
            onPress={() => { void confirmEnd(); }}
            style={styles.modalButton}
            testID="walking-end-confirm"
          />
        </View>
      </Modal>

      <Modal visible={showIdleModal} onClose={() => { }} title="No walking detected">
        <Text variant="body" style={styles.modalText}>
          Looks like you paused for now. You can continue this walk anytime.
        </Text>
        <View style={styles.modalRow}>
          <Button
            title="Keep this walk"
            onPress={() => { void continueAfterIdlePause(); }}
            variant="outline"
            style={styles.modalButton}
            testID="walking-idle-continue"
          />
          <Button
            title="Save for later"
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
                marginBottom: Math.max(insets.bottom + 24, 40),
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
            <Animated.View
              style={[
                styles.completionSummaryWrap,
                {
                  opacity: completionGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ]}
            >
              <WalkCompletionSummary
                themeMode={themeMode}
                palette={palette}
                kind={completionKind}
                stats={completionStats}
                distanceUnit={distanceUnit}
                actionLabel="Back to dashboard"
                onAction={dismissCompletion}
              />
            </Animated.View>
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
  topBarBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBackBtnPressed: {
    transform: [{ translateX: -2 }, { scale: 0.94 }],
  },
  topBarBtnPlaceholder: {
    width: 38,
    height: 38,
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
  mapPermissionGate: {
    flex: 1,
  },
  mapPermissionScroll: {
    width: '100%',
    flex: 1,
  },
  mapPermissionScrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPermissionCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  mapPermissionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mapPermissionTitle: {
    textAlign: 'center',
    marginBottom: 10,
  },
  mapPermissionMessage: {
    textAlign: 'center',
    lineHeight: 22,
  },
  mapPermissionHint: {
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
  },
  mapPermissionButton: {
    marginTop: 18,
  },
  mapPermissionHelpToggle: {
    width: '100%',
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapPermissionHelpToggleText: {
    fontWeight: theme.fontWeight.semibold,
  },
  mapPermissionHelpCard: {
    width: '100%',
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  mapPermissionHelpStep: {
    lineHeight: 20,
  },
  mapPermissionHelpEmphasis: {
    fontWeight: theme.fontWeight.semibold,
  },
  mapPermissionHelpNote: {
    lineHeight: 20,
    marginTop: 2,
  },
  mapPermissionNotice: {
    width: '100%',
    marginTop: 14,
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
  userArrowOuter: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#3b82f6',
    marginBottom: -4,
  },
  userArrowDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3b82f6',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
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
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotPulse: {
    position: 'absolute',
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
  noticeStack: {
    gap: 10,
    marginTop: 12,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeCopy: {
    flex: 1,
    gap: 6,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  noticeTitle: {
    fontWeight: theme.fontWeight.semibold,
    flex: 1,
  },
  noticeMessage: {
    lineHeight: 22,
  },
  noticeAction: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeActionText: {
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  warningAction: {
    minWidth: 52,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningActionText: {
    lineHeight: 16,
    fontWeight: theme.fontWeight.semibold,
  },
  warningDismiss: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingVertical: 0,
  },
  dragHandleGestureArea: {
    width: 84,
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  dragHandle: {
    height: 4,
    borderRadius: 999,
  },
  dragHandleHalo: {
    position: 'absolute',
    width: 56,
    height: 14,
    borderRadius: 999,
  },
  statusCapsule: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
  },
  statusCapsuleLabel: {
    fontWeight: theme.fontWeight.semibold,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  extraMetricsWrap: {
    overflow: 'hidden',
  },
  extraMetricsContent: {
    gap: 8,
    paddingTop: 2,
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
  metricLabel: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  metricValueWrap: {
    alignSelf: 'stretch',
  },
  metricValueWrapCentered: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums' as const],
  },
  metricValueCentered: {
    textAlign: 'center',
  },
  metricValueSteps: {
    fontSize: 24,
    lineHeight: 28,
  },
  metricFaceWrap: {
    width: '100%',
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipFaceBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricFlipHint: {
    alignSelf: 'flex-end',
    textAlign: 'right',
    fontSize: 10,
    lineHeight: 12,
  },
  metricFlipHintFront: {
    transform: [{ translateY: 2 }],
  },
  metricClockFront: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: theme.fontWeight.bold,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'center',
  },
  metricClockValueWrap: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricClockFrame: {
    minWidth: 92,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricClockPlaceholder: {
    opacity: 0.55,
  },
  metricClockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  metricClockStandalone: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  recoveryActionRow: {
    width: '100%',
  },
  recoveryActionButton: {
    minHeight: 52,
    borderRadius: 16,
  },
  walkActionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  walkActionButtonGlow: {
    shadowColor: theme.colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  walkActionButtonLabel: {
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: -0.1,
  },
  metricDigitalClock: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
  },
  walkStartLocationOverlayBadge: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  walkStartLocationOverlayBadgeText: {
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  walkStartLocationOverlayIntro: {
    marginBottom: 12,
    lineHeight: 22,
  },
  walkStartLocationOverlayBulletList: {
    gap: 10,
    marginBottom: 16,
  },
  walkStartLocationOverlayBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  walkStartLocationOverlayBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  walkStartLocationOverlayBulletText: {
    flex: 1,
    lineHeight: 20,
  },
  backgroundDisclosureBadge: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backgroundDisclosureBadgeText: {
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  backgroundDisclosureIntro: {
    marginBottom: 12,
    lineHeight: 22,
  },
  backgroundDisclosureBulletList: {
    gap: 10,
    marginBottom: 12,
  },
  backgroundDisclosureBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  backgroundDisclosureBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  backgroundDisclosureBulletText: {
    flex: 1,
    lineHeight: 20,
  },
  backgroundDisclosureFooter: {
    marginBottom: 18,
    lineHeight: 18,
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
    maxWidth: '90%',
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
    maxWidth: '92%',
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
  completionSummaryWrap: {
    width: '100%',
    zIndex: 1,
  },
  completionHeroWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
