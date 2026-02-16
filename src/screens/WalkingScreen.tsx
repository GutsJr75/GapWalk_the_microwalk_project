import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../App';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { NudgePlan, WalkSession } from '../lib/types';
import { plansRepo } from '../lib/repositories/plansRepo';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { analyticsService } from '../lib/analytics';
import { useAppStore } from '../store';

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

let MapViewImpl: any = null;
let MarkerImpl: any = null;
let PolylineImpl: any = null;
let PROVIDER_GOOGLE_IMPL: any = null;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapViewImpl = maps.default;
  MarkerImpl = maps.Marker;
  PolylineImpl = maps.Polyline;
  PROVIDER_GOOGLE_IMPL = maps.PROVIDER_GOOGLE;
}

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
  const { themeMode, setHasLocationPermission } = useAppStore();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [paused, setPaused] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [steps, setSteps] = useState(0);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [hadWalkingSignal, setHadWalkingSignal] = useState(false);
  const [currentCoord, setCurrentCoord] = useState<Coord | null>(null);
  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);

  const startIsoRef = useRef(new Date().toISOString());
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPointRef = useRef<PathPoint | null>(null);
  const mapRef = useRef<any>(null);

  const completionPopAnim = useRef(new Animated.Value(0)).current;
  const completionBurstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    setSteps(Math.max(0, Math.round(distanceMeters / STRIDE_METERS)));
  }, [distanceMeters]);

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
      }

      if (!pausedRef.current && segmentMeters >= MIN_SEGMENT_METERS && segmentMeters <= MAX_VALID_JUMP_METERS) {
        setDistanceMeters((prevDistance) => prevDistance + segmentMeters);
      }
    }

    lastPointRef.current = { coord: nextCoord, timestampMs: nextTimestamp };
  }, []);

  const requestPermissionAndTrack = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;

      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }

      if (status !== 'granted') {
        setPermissionDenied(true);
        setHasLocationPermission(false);
        setIsTracking(false);
        return;
      }

      setPermissionDenied(false);
      setHasLocationPermission(true);

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      applyLocationPoint(initial);
      setRouteCoords([
        {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
        },
      ]);

      setIsTracking(true);
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1500,
          distanceInterval: 2,
          mayShowUserSettingsDialog: true,
        },
        applyLocationPoint
      );
    } catch (error) {
      console.error('Failed to initialize location tracking:', error);
      setPermissionDenied(true);
      setIsTracking(false);
    }
  }, [applyLocationPoint, setHasLocationPermission]);

  useEffect(() => {
    void (async () => {
      if (planId) {
        const found = await plansRepo.getById(planId);
        if (found) {
          setPlan(found);
          await plansRepo.updateStatus(planId, 'started');
        }
      }
      await requestPermissionAndTrack();
    })();

    timerRef.current = setInterval(() => {
      setTicks((prev) => prev + 1);
      if (!pausedRef.current) {
        setActiveSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      watchRef.current?.remove();
    };
  }, [planId, requestPermissionAndTrack]);

  const togglePause = () => {
    if (paused) {
      const pauseStarted = pauseStartedAtRef.current;
      if (pauseStarted) {
        setPausedSeconds((prev) => prev + Math.floor((Date.now() - pauseStarted) / 1000));
      }
      pauseStartedAtRef.current = null;
      setPaused(false);
      return;
    }

    pauseStartedAtRef.current = Date.now();
    setPaused(true);
    setIsWalking(false);
  };

  const remainingSeconds = useMemo(() => {
    if (!plan) return activeSeconds;
    const endMs = new Date(plan.gapEnd).getTime();
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  }, [activeSeconds, plan, ticks]);

  const targetSeconds = useMemo(() => {
    if (!plan) return null;
    const startMs = new Date(startIsoRef.current).getTime();
    const endMs = new Date(plan.gapEnd).getTime();
    return Math.max(60, Math.floor((endMs - startMs) / 1000));
  }, [plan]);

  const progressRatio = targetSeconds
    ? Math.max(0, Math.min(1, 1 - remainingSeconds / targetSeconds))
    : Math.max(0, Math.min(1, activeSeconds / 900));

  const statusLabel = paused
    ? 'Paused'
    : permissionDenied
      ? 'Location off'
      : isTracking
        ? (isWalking ? 'Walking now' : 'Not moving yet')
        : 'Locating';

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

  const saveSession = async () => {
    const pauseStarted = pauseStartedAtRef.current;
    const finalPausedSeconds = paused && pauseStarted
      ? pausedSeconds + Math.floor((Date.now() - pauseStarted) / 1000)
      : pausedSeconds;

    const session: WalkSession = {
      id: `s-${Date.now()}`,
      nudgePlanId: planId,
      start: startIsoRef.current,
      end: new Date().toISOString(),
      activeSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters,
      steps,
      usedLocation: isTracking && !permissionDenied,
      createdAt: new Date().toISOString(),
    };

    await sessionsRepo.save(session);
    if (planId) {
      await plansRepo.updateStatus(planId, 'completed');
    }

    analyticsService.track('walk_completed', {
      planId: planId || null,
      activeSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters: Math.round(distanceMeters),
      steps,
      usedLocation: isTracking && !permissionDenied,
      hadWalkingSignal,
    });

    setShowCompletion(true);
    completionPopAnim.setValue(0);
    completionBurstAnim.setValue(0);

    Animated.parallel([
      Animated.timing(completionPopAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(completionBurstAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      setShowCompletion(false);
      navigation.navigate('Dashboard');
    }, 2200);
  };

  const confirmEnd = async () => {
    setShowEndModal(false);
    await saveSession();
  };

  const sheetBg = themeMode === 'dark' ? 'rgba(6, 18, 43, 0.95)' : 'rgba(247, 251, 255, 0.97)';
  const topBarBg = themeMode === 'dark' ? '#061633' : '#f1f6ff';
  const sheetBorder = themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)';

  const completionOverlayBg = themeMode === 'dark' ? 'rgba(2, 8, 20, 0.82)' : 'rgba(236, 245, 255, 0.82)';
  const completionCardBg = themeMode === 'dark' ? '#0f1f3d' : '#f7fbff';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bgApp }]} edges={['top', 'left', 'right']}>
      <View style={[styles.topBar, { backgroundColor: topBarBg, borderBottomColor: sheetBorder }]}>
        <Text variant="title" style={styles.topTitle}>Walking</Text>
      </View>

      <View style={styles.mapArea}>
        {MapViewImpl ? (
          <MapViewImpl
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE_IMPL : undefined}
            initialRegion={{
              latitude: currentCoord?.latitude ?? DEFAULT_COORD.latitude,
              longitude: currentCoord?.longitude ?? DEFAULT_COORD.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            customMapStyle={themeMode === 'dark' ? DARK_MAP_STYLE : undefined}
            showsUserLocation={isTracking && !permissionDenied}
            showsMyLocationButton={false}
            scrollEnabled
            zoomEnabled
            rotateEnabled
            pitchEnabled
          >
            {PolylineImpl && routeCoords.length > 1 && (
              <PolylineImpl
                coordinates={routeCoords}
                strokeColor={theme.colors.accentPrimary}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {MarkerImpl && currentCoord && (
              <MarkerImpl coordinate={currentCoord} pinColor="#2cb7ff" />
            )}
          </MapViewImpl>
        ) : (
          <View style={styles.mapFallback}>
            <Text variant="bodySmall" color={palette.textMuted}>Map view is unavailable on web preview.</Text>
          </View>
        )}

        <View style={styles.mapShade} pointerEvents="none" />

        <View style={styles.zoomStack}>
          <Pressable style={[styles.zoomBtn, { borderColor: sheetBorder }]} onPress={() => { void zoomBy(1); }}>
            <Text variant="title" style={styles.zoomText}>+</Text>
          </Pressable>
          <Pressable style={[styles.zoomBtn, { borderColor: sheetBorder }]} onPress={() => { void zoomBy(-1); }}>
            <Text variant="title" style={styles.zoomText}>-</Text>
          </Pressable>
          <Pressable style={[styles.zoomBtn, { borderColor: sheetBorder }]} onPress={recenterMap}>
            <Text variant="bodySmall" style={styles.zoomText}>◎</Text>
          </Pressable>
        </View>

        <View style={[styles.statusPill, { backgroundColor: sheetBg, borderColor: sheetBorder }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text variant="bodySmall" color={palette.textPrimary}>{statusLabel}</Text>
        </View>

        {permissionDenied && (
          <View style={[styles.permissionCard, { backgroundColor: sheetBg, borderColor: sheetBorder }]}>
            <Text variant="bodySmall" style={styles.permissionTitle}>Enable location to show live route and step count.</Text>
            <View style={styles.permissionActions}>
              <Button
                title="Not now"
                onPress={() => setPermissionDenied(false)}
                variant="outline"
                style={styles.permissionBtn}
                testID="walking-location-deny"
              />
              <Button
                title="Enable"
                onPress={() => {
                  void requestPermissionAndTrack();
                }}
                style={styles.permissionBtn}
                testID="walking-location-allow"
              />
            </View>
          </View>
        )}
      </View>

      <View style={[styles.sheet, { backgroundColor: sheetBg, borderTopColor: sheetBorder, paddingBottom: Math.max(insets.bottom + 8, 18) }]}>
        <View style={[styles.progressTrack, { backgroundColor: themeMode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(15,23,42,0.24)' }]}>
          <View style={[styles.progressFill, { width: `${Math.max(progressRatio * 100, 5)}%` }]} />
        </View>

        <Text variant="body" style={styles.timerLabel}>{plan ? 'Remaining Time' : 'Session Time'}</Text>
        <Text variant="heading" style={styles.timerValue}>{formatClock(remainingSeconds)}</Text>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, { backgroundColor: themeMode === 'dark' ? '#1a2a4a' : '#dfe9f9' }]}>
            <Text variant="body" style={styles.metricTitle}>Distance</Text>
            <Text variant="heading" style={styles.metricValue}>{formatMiles(distanceMeters)}</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: themeMode === 'dark' ? '#1a2a4a' : '#dfe9f9' }]}>
            <Text variant="body" style={styles.metricTitle}>Steps</Text>
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

      {showCompletion && (
        <Animated.View style={[styles.completionOverlay, { backgroundColor: completionOverlayBg, opacity: completionPopAnim }]} pointerEvents="none">
          <Animated.View
            style={[
              styles.completionBurst,
              {
                borderColor: theme.colors.accentPrimary,
                opacity: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: completionBurstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 2.1] }) }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.completionCard,
              {
                backgroundColor: completionCardBg,
                borderColor: sheetBorder,
                opacity: completionPopAnim,
                transform: [{ scale: completionPopAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              },
            ]}
          >
            <View style={[styles.completionBadge, { backgroundColor: theme.colors.accentPrimary }]}>
              <Text variant="title" style={styles.completionBadgeText}>✓</Text>
            </View>
            <Text variant="title" style={styles.completionTitle}>Walk complete</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.completionSubtitle}>
              {Math.max(1, Math.floor(activeSeconds / 60))} min - {steps} steps - {formatMiles(distanceMeters)}
            </Text>
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
    height: 68,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 38,
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
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 16, 0.18)',
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
    backgroundColor: 'rgba(12, 20, 36, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: '#eaf0ff',
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
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2cb7ff',
  },
  timerLabel: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 18,
    fontWeight: theme.fontWeight.semibold,
  },
  timerValue: {
    textAlign: 'center',
    fontSize: 42,
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  metricTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 30,
    lineHeight: 36,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
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
  completionBurst: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
  },
  completionCard: {
    minWidth: 250,
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  completionBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completionBadgeText: {
    color: '#062a1d',
    fontWeight: theme.fontWeight.bold,
  },
  completionTitle: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 6,
  },
  completionSubtitle: {
    textAlign: 'center',
  },
});
