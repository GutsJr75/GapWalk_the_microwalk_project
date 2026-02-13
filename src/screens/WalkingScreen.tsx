import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { WalkSession, NudgePlan } from '../lib/types';
import { sessionsRepo } from '../lib/repositories/sessionsRepo';
import { plansRepo } from '../lib/repositories/plansRepo';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'Walking'>;

interface Coord { latitude: number; longitude: number }

export const WalkingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { planId } = route.params;
  const { hasLocationPermission, setHasLocationPermission } = useAppStore();

  const [plan, setPlan] = useState<NudgePlan | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeS, setActiveS] = useState(0);
  const [pausedS, setPausedS] = useState(0);
  const [startISO] = useState(new Date().toISOString());
  const pauseRef = useRef<number | null>(null);
  const [showLocPrompt, setShowLocPrompt] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [calories, setCalories] = useState(0);
  const [showEnd, setShowEnd] = useState(false);
  const [lowTime, setLowTime] = useState(false);
  const [milestoneReached, setMilestoneReached] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPt = useRef<Coord | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const milestoneAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (planId) plansRepo.getById(planId).then(p => { if (p) { setPlan(p); plansRepo.updateStatus(planId, 'started'); }});
    timerRef.current = setInterval(() => {
      if (!paused) {
        setActiveS(p => {
          const newSeconds = p + 1;
          const newMinutes = Math.floor(newSeconds / 60);
          // Check for milestones (1, 2, 3, 5, 10 minutes)
          if ([60, 120, 180, 300, 600].includes(newSeconds) && newSeconds % 60 === 0) {
            setMilestoneReached(newMinutes);
            setTimeout(() => setMilestoneReached(null), 3000);
            Animated.sequence([
              Animated.timing(milestoneAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.delay(2000),
              Animated.timing(milestoneAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();
          }
          return newSeconds;
        });
        setCalories(c => c + 0.05);
      }
    }, 1000);
    
    // Pulse animation for timer
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    const t = setTimeout(() => { if (!hasLocationPermission) setShowLocPrompt(true); }, 2000);
    return () => { clearTimeout(t); if (timerRef.current) clearInterval(timerRef.current); watchRef.current?.remove(); };
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!paused) { setActiveS(p => p + 1); setCalories(c => c + 0.05); }
    }, 1000);
  }, [paused]);

  const togglePause = () => {
    if (paused) {
      if (pauseRef.current) setPausedS(p => p + Math.floor((Date.now() - (pauseRef.current || 0)) / 1000));
      pauseRef.current = null;
      setPaused(false);
    } else {
      pauseRef.current = Date.now();
      setPaused(true);
      if (plan) {
        const rem = (new Date(plan.gapEnd).getTime() - Date.now()) / 60000;
        if (rem <= 2) setLowTime(true);
      }
    }
  };

  const [showCompletion, setShowCompletion] = useState(false);
  const completionAnim = useRef(new Animated.Value(0)).current;

  const save = async () => {
    const s: WalkSession = { id: `s-${Date.now()}`, nudgePlanId: planId, start: startISO, end: new Date().toISOString(), activeSeconds: activeS, pausedSeconds: pausedS, distanceMeters: distance, calories: Math.round(calories), usedLocation: tracking, createdAt: new Date().toISOString() };
    await sessionsRepo.save(s);
    if (planId) await plansRepo.updateStatus(planId, 'completed');
    
    // Show completion celebration
    setShowCompletion(true);
    Animated.sequence([
      Animated.timing(completionAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(completionAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowCompletion(false);
      navigation.navigate('Dashboard');
    });
  };

  const confirmEnd = async () => { 
    setShowEnd(false); 
    await save();
  };

  const allowLoc = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') { setHasLocationPermission(true); setShowLocPrompt(false); startTrack(); }
    else setShowLocPrompt(false);
  };

  const startTrack = async () => {
    setTracking(true);
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
      loc => {
        const pt = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        if (lastPt.current) setDistance(d => d + haversine(lastPt.current!, pt));
        lastPt.current = pt;
      },
    );
  };

  const haversine = (a: Coord, b: Coord) => {
    const R = 6371e3;
    const f1 = a.latitude * Math.PI / 180, f2 = b.latitude * Math.PI / 180;
    const df = (b.latitude - a.latitude) * Math.PI / 180, dl = (b.longitude - a.longitude) * Math.PI / 180;
    const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const fmt = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const remaining = () => {
    if (plan) { const r = Math.max(0, Math.floor((new Date(plan.gapEnd).getTime() - Date.now()) / 1000)); return fmt(r); }
    return fmt(activeS);
  };

  return (
    <Container safeArea>
      <View style={styles.body}>
        <Text variant="title" style={styles.title}>{paused ? 'Paused' : 'Walking'}</Text>
        <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.titleHint}>
          {paused ? 'Tap Resume to continue your walk.' : 'Keep going! Every step counts.'}
        </Text>

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Card elevated style={styles.timerCard}>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.timerLabel}>
              {plan ? 'Time remaining' : 'Active time'}
            </Text>
            <Text variant="heading" style={styles.bigTime}>{remaining()}</Text>
            {!paused && (
              <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.timerHint}>
                Keep moving! 🚶
              </Text>
            )}
          </Card>
        </Animated.View>

        {/* Milestone Celebration */}
        {milestoneReached !== null && (
          <Animated.View
            style={[
              styles.milestoneOverlay,
              {
                opacity: milestoneAnim,
                transform: [
                  {
                    scale: milestoneAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <Card style={styles.milestoneCard}>
              <Text style={styles.milestoneEmoji}>🎯</Text>
              <Text variant="title" style={styles.milestoneText}>
                {milestoneReached} Minute{milestoneReached > 1 ? 's' : ''}!
              </Text>
              <Text variant="bodySmall" color={theme.colors.textMuted}>
                Great progress!
              </Text>
            </Card>
          </Animated.View>
        )}

        <View style={styles.statRow}>
          {tracking ? (
            <>
              <Card elevated style={styles.miniCard}>
                <Text variant="bodySmall" color={theme.colors.textMuted}>Distance</Text>
                <Text variant="title" style={styles.miniValue}>
                  {distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}
                </Text>
              </Card>
              <Card elevated style={styles.miniCard}>
                <Text variant="bodySmall" color={theme.colors.textMuted}>Calories</Text>
                <Text variant="title" style={styles.miniValue}>{Math.round(calories)}</Text>
              </Card>
            </>
          ) : (
            <Card elevated style={styles.miniCard}>
              <Text variant="bodySmall" color={theme.colors.textMuted}>Active time</Text>
              <Text variant="title" style={styles.miniValue}>{fmt(activeS)}</Text>
            </Card>
          )}
        </View>

        {lowTime && (
          <Card style={styles.warn}>
            <Text variant="bodySmall" color={theme.colors.warning}>
              Your gap is almost over. Consider heading back.
            </Text>
          </Card>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.btnRow}>
          <Button title="End Walk" onPress={() => setShowEnd(true)} variant="outline" style={styles.btn} />
          <Button title={paused ? 'Resume' : 'Pause'} onPress={togglePause} style={styles.btn} />
        </View>
      </View>

      <Modal visible={showLocPrompt} onClose={() => setShowLocPrompt(false)} title="Enable Location?">
        <Text variant="body" style={styles.mTxt}>
          Allow location to track your route and estimate distance. You can still track time without this.
        </Text>
        <View style={styles.mRow}>
          <Button title="Not now" onPress={() => setShowLocPrompt(false)} variant="outline" style={styles.btn} />
          <Button title="Allow" onPress={allowLoc} style={styles.btn} />
        </View>
      </Modal>

      <Modal visible={showEnd} onClose={() => setShowEnd(false)} title="End Walk?">
        <Text variant="body" style={styles.mTxt}>Are you sure you want to end this walk session?</Text>
        <View style={styles.mRow}>
          <Button title="Cancel" onPress={() => setShowEnd(false)} variant="outline" style={styles.btn} />
          <Button title="Yes, end" onPress={confirmEnd} style={styles.btn} />
        </View>
      </Modal>

      {/* Completion Celebration */}
      {showCompletion && (
        <Animated.View
          style={[
            styles.completionOverlay,
            {
              opacity: completionAnim,
              transform: [
                {
                  scale: completionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.completionContent}>
            <Text style={styles.completionEmoji}>🎉</Text>
            <Text variant="title" style={styles.completionText}>Walk Complete!</Text>
            <Text variant="bodySmall" color={theme.colors.textMuted} style={styles.completionSubtext}>
              {Math.floor(activeS / 60)} minutes • {Math.round(calories)} calories
              {distance > 0 && ` • ${distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(2)}km`}`}
            </Text>
          </View>
        </Animated.View>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 20,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  title: { textAlign: 'center', marginBottom: 4 },
  titleHint: { textAlign: 'center', marginBottom: 24 },
  timerCard: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 12,
  },
  timerLabel: { marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontSize: theme.fontSize.xs },
  bigTime: { fontSize: 48, fontWeight: theme.fontWeight.bold, color: theme.colors.accentPrimary, letterSpacing: 2 },
  timerHint: { marginTop: 8, textAlign: 'center' },
  milestoneOverlay: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  milestoneCard: {
    backgroundColor: theme.colors.bgSurfaceElevated,
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.accentPrimary,
    alignItems: 'center',
    shadowColor: theme.colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  milestoneEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  milestoneText: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 4,
  },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  miniCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  miniValue: { marginTop: 4, fontWeight: theme.fontWeight.bold },
  warn: { borderWidth: 1, borderColor: theme.colors.warning, marginBottom: 12 },
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingVertical: 20,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1 },
  mTxt: { textAlign: 'center', marginBottom: 16 },
  mRow: { flexDirection: 'row', gap: 12 },
  completionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  completionContent: {
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurfaceElevated,
    borderRadius: theme.borderRadius.lg,
    padding: 32,
    borderWidth: 2,
    borderColor: theme.colors.accentPrimary,
  },
  completionEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  completionText: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 8,
    textAlign: 'center',
  },
  completionSubtext: {
    textAlign: 'center',
  },
});
