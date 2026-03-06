import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Pressable, Platform } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Card } from './Card';
import { Text } from './Text';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

type StatTone = 'target' | 'notifications' | 'steps';

interface StatCardProps {
  title: string;
  current: number;
  target: number;
  unitLabel?: string;
  tone?: StatTone;
}

const MOTIVATIONAL_MESSAGES: Record<StatTone, string[]> = {
  target: ['Crushed it!', 'Goal smashed!', 'Walking champion!'],
  notifications: ['All caught up!', 'Stay connected!', 'Nailed it!'],
  steps: ['Step master!', 'Legs of steel!', 'Keep stepping!'],
};

const CARD_INSIGHTS: Record<
  StatTone,
  { badgeLabel: string; description: string }
> = {
  target: {
    badgeLabel: 'Walk Goal',
    description: 'How close you are to today\'s walking target.',
  },
  notifications: {
    badgeLabel: 'Reminders',
    description: 'How many reminders have been sent today.',
  },
  steps: {
    badgeLabel: 'Step Goal',
    description: 'How close you are to your daily step target.',
  },
};

const getMotivationalMessage = (tone: StatTone): string => {
  const msgs = MOTIVATIONAL_MESSAGES[tone];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return msgs[dayOfYear % msgs.length];
};

const singularizeUnit = (unit: string): string => {
  if (unit === 'minutes') return 'minute';
  if (unit === 'times') return 'time';
  if (unit === 'steps') return 'step';
  if (unit.endsWith('s')) return unit.slice(0, -1);
  return unit;
};

const getProgressStateLabel = (pct: number): string => {
  if (pct >= 1) return 'Completed';
  if (pct >= 0.75) return 'Almost there';
  if (pct >= 0.35) return 'In progress';
  return 'Getting started';
};

const PARTICLE_COUNT = 8;
const PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const CARD_FACE_MIN_HEIGHT = 222;

export const StatCard: React.FC<StatCardProps> = ({
  title,
  current,
  target,
  unitLabel = 'minutes',
  tone = 'target',
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();

  const rawPct = target > 0 ? current / target : 0;
  const pct = target > 0 ? Math.min(rawPct, 1) : 0;

  // --- Animated values ---
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const animatedCount = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;
  const flipAnim = useRef(new Animated.Value(0)).current;
  const pressScaleAnim = useRef(new Animated.Value(1)).current;
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0))
  ).current;

  // --- State ---
  const [animState, setAnimState] = useState({ pct: 0, displayCount: 0 });
  const [flipped, setFlipped] = useState(false);
  const hasCelebrated = useRef(false);
  const goalPulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  // --- 1. Entrance ---
  useEffect(() => {
    Animated.timing(entranceAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // --- 2. Ring fill + counting numbers ---
  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: pct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.timing(animatedCount, {
      toValue: current,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (current > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animatedCount, animatedProgress, current, pct, scaleAnim]);

  useEffect(() => {
    const progressId = animatedProgress.addListener(({ value }) => {
      setAnimState((state) => ({
        ...state,
        pct: value,
      }));
    });
    const countId = animatedCount.addListener(({ value }) => {
      setAnimState((state) => ({
        ...state,
        displayCount: Math.round(value),
      }));
    });

    return () => {
      animatedProgress.removeListener(progressId);
      animatedCount.removeListener(countId);
    };
  }, [animatedCount, animatedProgress]);

  // --- 3. Breathing glow when pct > 0.75 ---
  useEffect(() => {
    if (pct > 0.75) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      breatheAnim.setValue(0);
    }
  }, [pct > 0.75]);

  // --- 4. Celebration effects ---
  useEffect(() => {
    if (pct >= 1 && !hasCelebrated.current) {
      hasCelebrated.current = true;
      const timeout = setTimeout(() => {
        // Checkmark
        Animated.spring(celebrationAnim, {
          toValue: 1,
          tension: 60,
          friction: 6,
          useNativeDriver: true,
        }).start();

        // Shimmer
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();

        // Confetti particles
        Animated.stagger(
          50,
          particleAnims.map((anim) =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 700,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            })
          )
        ).start(() => {
          particleAnims.forEach((a) => a.setValue(0));
        });

        // Haptic
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }

        // Start goal-reached continuous pulse after celebration
        setTimeout(() => {
          const pulse = Animated.loop(
            Animated.sequence([
              Animated.timing(scaleAnim, {
                toValue: 1.03,
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ])
          );
          goalPulseRef.current = pulse;
          pulse.start();
        }, 800);
      }, 1000);

      return () => {
        clearTimeout(timeout);
        goalPulseRef.current?.stop();
      };
    } else if (pct < 1) {
      hasCelebrated.current = false;
      celebrationAnim.setValue(0);
      shimmerAnim.setValue(0);
      goalPulseRef.current?.stop();
    }
  }, [pct >= 1]);

  // --- 5. Tap-to-flip ---
  const handleCardPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const toValue = flipped ? 0 : 1;
    setFlipped(!flipped);
    Animated.spring(flipAnim, {
      toValue,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [flipped, flipAnim]);

  const handlePressIn = useCallback(() => {
    Animated.spring(pressScaleAnim, {
      toValue: 0.95,
      tension: 150,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressScaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  // --- Flip interpolations ---
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '90deg', '180deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['180deg', '270deg', '360deg'],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // --- Colors ---
  const toneColor = (() => {
    if (tone === 'target') return palette.success;
    if (tone === 'notifications') return palette.info;
    if (tone === 'steps') return theme.colors.warning;
    return palette.accentPrimary;
  })();

  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const normalized = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  };

  const withAlpha = (hex: string, alpha: number, fallback: string): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return fallback;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  };

  const currentStrokeDashoffset = circumference - animState.pct * circumference;
  const trackStroke = withAlpha(
    toneColor,
    isDark ? 0.24 : 0.26,
    isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'
  );
  const cardTint = withAlpha(
    toneColor,
    isDark ? 0.08 : 0.1,
    isDark ? palette.bgSurfaceElevated : palette.bgSurfaceElevated
  );
  const borderTint = withAlpha(
    toneColor,
    isDark ? 0.32 : 0.18,
    isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)'
  );
  const insight = CARD_INSIGHTS[tone];
  const remaining = Math.max(target - current, 0);
  const remainingUnit = remaining === 1 ? singularizeUnit(unitLabel) : unitLabel;
  const statusLabel = getProgressStateLabel(pct);
  const preferenceHint = (() => {
    if (tone === 'target') return 'Want to change this preference? Go to Preferences, then tap Daily Target to edit it.';
    if (tone === 'notifications') return 'Want to change this preference? Go to Preferences, then tap Notification Count to edit it.';
    if (tone === 'steps') return 'Want to change this preference? Go to Preferences, then tap Step Goal to edit it.';
    return 'Want to change this preference? Go to Preferences to edit it.';
  })();

  const progressLabel = `${current}/${target}`;
  const currentValueStyle =
    progressLabel.length >= 9
      ? styles.currentValueCompact
      : progressLabel.length >= 7
        ? styles.currentValueMedium
        : styles.currentValue;
  const goalValueStyle =
    progressLabel.length >= 9
      ? styles.goalValueCompact
      : progressLabel.length >= 7
        ? styles.goalValueMedium
        : styles.goalValue;

  // --- Front face content ---
  const frontContent = (
    <Card shadowed={false} style={[styles.card, { backgroundColor: cardTint, borderColor: borderTint }]}>
      <View style={[styles.headerTopRow, styles.frontHeaderRow]}>
        <Text variant="body" style={styles.title}>{title}</Text>
        <View
          style={[
            styles.headerBadge,
            {
              backgroundColor: withAlpha(
                toneColor,
                isDark ? 0.22 : 0.12,
                isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)'
              ),
              borderColor: withAlpha(
                toneColor,
                isDark ? 0.36 : 0.18,
                isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
              ),
            },
          ]}
        >
          <Text variant="bodySmall" style={[styles.headerBadgeText, { color: toneColor }]}>
            {insight.badgeLabel}
          </Text>
        </View>
      </View>

      <View style={styles.circleContainer}>
        {/* Breathing glow ring */}
        {pct > 0.75 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.glowRing, {
              borderColor: toneColor,
              opacity: breatheAnim.interpolate({
                inputRange: [0, 1],
                outputRange: pct >= 1 ? [0.25, 0.6] : [0.15, 0.45],
              }),
            }]}
          />
        )}

        <Animated.View style={[styles.svgWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.circleCore, { backgroundColor: withAlpha(toneColor, isDark ? 0.12 : 0.1, 'transparent') }]} />
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                stroke={trackStroke}
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
              />
              <Circle
                stroke={toneColor}
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={currentStrokeDashoffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.circleText}>
            <Text variant="title" style={[currentValueStyle, { color: palette.textPrimary }]}>
              {animState.displayCount}
              <Text variant="title" style={[goalValueStyle, { color: palette.textMuted }]}>/{target}</Text>
            </Text>
          </View>

          {/* Checkmark overlay */}
          {pct >= 1 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.checkmarkOverlay, {
                backgroundColor: isDark ? 'rgba(12,22,38,0.92)' : 'rgba(255,255,255,0.96)',
                borderColor: withAlpha(
                  toneColor,
                  isDark ? 0.38 : 0.24,
                  isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)'
                ),
                opacity: celebrationAnim,
                transform: [{
                  scale: celebrationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                }],
              }]}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke={toneColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Animated.View>
          )}
        </Animated.View>

        {/* Confetti particles */}
        {pct >= 1 &&
          particleAnims.map((anim, i) => {
            const angle = (PARTICLE_ANGLES[i] * Math.PI) / 180;
            const distance = 45;
            const isWhite = i % 2 === 1;
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[styles.particle, {
                  backgroundColor: isWhite ? '#fff' : toneColor,
                  opacity: anim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(angle) * distance],
                      }),
                    },
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(angle) * distance],
                      }),
                    },
                    {
                      scale: anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1.2, 0.3],
                      }),
                    },
                  ],
                }]}
              />
            );
          })}
      </View>

      <Text
        variant="bodySmall"
        style={[
          styles.completion,
          { color: palette.textMuted },
          pct >= 1 && { color: toneColor, fontWeight: theme.fontWeight.semibold },
        ]}
      >
        {pct >= 1 ? 'Daily goal achieved' : `${remaining} ${remainingUnit} left today`}
      </Text>
      <Text variant="bodySmall" style={[styles.flipHint, { color: palette.success }]}>
        Tap to flip
      </Text>

      {/* Shimmer wave */}
      {pct >= 1 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmer, {
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 0.3, 0.7, 1],
              outputRange: [0, 0.25, 0.25, 0],
            }),
            transform: [{
              translateX: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-200, 200],
              }),
            }],
          }]}
        />
      )}
    </Card>
  );

  // --- Back face content ---
  const backContent = (
    <Card shadowed={false} style={[styles.card, { backgroundColor: cardTint, borderColor: borderTint }]}>
      <View style={styles.backContent}>
        <View style={styles.headerTopRow}>
          <Text variant="body" style={styles.title}>{title}</Text>
          <View
            style={[
              styles.headerBadge,
              {
                backgroundColor: withAlpha(
                  toneColor,
                  isDark ? 0.22 : 0.12,
                  isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)'
                ),
                borderColor: withAlpha(
                  toneColor,
                  isDark ? 0.36 : 0.2,
                  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
                ),
              },
            ]}
          >
            <Text variant="bodySmall" style={[styles.headerBadgeText, { color: toneColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} ellipsizeMode="tail" variant="bodySmall" style={[styles.backDescription, { color: palette.textMuted }]}>
          {insight.description}
        </Text>

        <View style={styles.backPercentWrap}>
          <Text variant="title" style={[styles.backPercent, { color: toneColor }]}>
            {Math.round(pct * 100)}%
          </Text>
          <Text variant="bodySmall" style={{ color: palette.textMuted }}>
            {pct >= 1 ? getMotivationalMessage(tone) : `${remaining} ${remainingUnit} left today`}
          </Text>
        </View>

        <View style={styles.preferenceHintContainer}>
          <Text variant="bodySmall" style={[styles.preferenceHint, { color: palette.textMuted }]}>
            {preferenceHint}
          </Text>
        </View>
      </View>
    </Card>
  );

  return (
    <Animated.View
      style={{
        opacity: entranceAnim,
        transform: [
          { translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
        ],
      }}
    >
      <Pressable onPress={handleCardPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[styles.flipShell, { transform: [{ scale: pressScaleAnim }] }]}>
          {/* Front face */}
          <Animated.View
            style={{
              transform: [{ perspective: 800 }, { rotateY: frontRotate }],
              opacity: frontOpacity,
              backfaceVisibility: 'hidden',
            }}
          >
            {frontContent}
          </Animated.View>

          {/* Back face */}
          <Animated.View
            style={[StyleSheet.absoluteFill, {
              transform: [{ perspective: 800 }, { rotateY: backRotate }],
              opacity: backOpacity,
              backfaceVisibility: 'hidden',
            }]}
          >
            {backContent}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingVertical: theme.spacing.md,
    minHeight: CARD_FACE_MIN_HEIGHT,
  },
  flipShell: {
    overflow: 'hidden',
    borderRadius: theme.borderRadius.lg,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  frontHeaderRow: {
    marginBottom: theme.spacing.sm + theme.spacing.xs,
  },
  title: { fontWeight: theme.fontWeight.semibold, marginBottom: 0, flexShrink: 1 },
  headerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  headerBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 14,
    letterSpacing: 0,
  },
  circleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm + theme.spacing.xs,
  },
  svgWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  circleCore: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  circleText: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  currentValue: { fontWeight: theme.fontWeight.bold, lineHeight: 30 },
  currentValueMedium: {
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xl - 2,
    lineHeight: 26,
  },
  currentValueCompact: {
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xl - 4,
    lineHeight: 24,
  },
  goalValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  goalValueMedium: {
    fontSize: theme.fontSize.sm + 1,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  goalValueCompact: {
    fontSize: theme.fontSize.xs + 1,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  completion: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  flipHint: {
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
    textAlign: 'right',
    alignSelf: 'flex-end',
    marginTop: theme.spacing.sm,
  },
  glowRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  backContent: {
    alignItems: 'stretch',
    flex: 1,
    justifyContent: 'flex-start',
  },
  backDescription: {
    marginTop: theme.spacing.xs + 4,
    lineHeight: 18,
    textAlign: 'left',
  },
  backPercentWrap: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  backPercent: {
    fontSize: 32,
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    lineHeight: 38,
  },
  preferenceHintContainer: {
    marginTop: theme.spacing.md,
  },
  preferenceHint: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    textAlign: 'left',
  },
});
