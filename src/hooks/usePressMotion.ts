import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { playHaptic, type FeedbackIntent } from '../services/haptics';
import { motion, getMotionDuration } from '../theme/motion';
import { useReducedMotionPreference } from './useReducedMotionPreference';

type TimerRef = ReturnType<typeof setTimeout> | null;

interface UsePressMotionOptions {
  onPress: () => void;
  enabled?: boolean;
  pressScale?: number;
  hapticIntent?: FeedbackIntent | null;
  actionDelayMs?: number;
  glowHoldMs?: number;
}

interface UsePressMotionResult {
  isPressActive: boolean;
  scaleAnim: Animated.Value;
  reduceMotion: boolean;
  handlePress: () => void;
  handlePressIn: () => void;
  handlePressOut: () => void;
  animatedTransformStyle: { transform: Array<{ scale: Animated.Value }> };
}

export const usePressMotion = ({
  onPress,
  enabled = true,
  pressScale = motion.scale.pressStandard,
  hapticIntent = 'selection',
  actionDelayMs = 24,
  glowHoldMs = 110,
}: UsePressMotionOptions): UsePressMotionResult => {
  const { reduceMotion } = useReducedMotionPreference();
  const [isPressActive, setIsPressActive] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const actionTimeoutRef = useRef<TimerRef>(null);
  const glowTimeoutRef = useRef<TimerRef>(null);

  const clearTimers = useCallback(() => {
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
      glowTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const animateScale = useCallback((toValue: number) => {
    if (reduceMotion) {
      scaleAnim.setValue(toValue);
      return;
    }
    Animated.spring(scaleAnim, {
      toValue,
      ...motion.spring[toValue < 1 ? 'pressIn' : 'pressOut'],
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scaleAnim]);

  const queueInactiveState = useCallback(() => {
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
    }
    glowTimeoutRef.current = setTimeout(() => {
      setIsPressActive(false);
      glowTimeoutRef.current = null;
    }, getMotionDuration(reduceMotion, glowHoldMs, motion.duration.instant));
  }, [glowHoldMs, reduceMotion]);

  const handlePressIn = useCallback(() => {
    if (!enabled) return;
    setIsPressActive(true);
    animateScale(reduceMotion ? 1 : pressScale);
  }, [animateScale, enabled, pressScale, reduceMotion]);

  const handlePressOut = useCallback(() => {
    if (!enabled) return;
    animateScale(1);
    if (actionTimeoutRef.current) return;
    queueInactiveState();
  }, [animateScale, enabled, queueInactiveState]);

  const handlePress = useCallback(() => {
    if (!enabled) return;

    if (hapticIntent) {
      void playHaptic(hapticIntent);
    }

    clearTimers();
    setIsPressActive(true);

    const runAction = () => {
      actionTimeoutRef.current = null;
      onPress();
      queueInactiveState();
    };

    const delay = getMotionDuration(reduceMotion, actionDelayMs, 0);
    if (delay <= 0) {
      runAction();
      return;
    }

    actionTimeoutRef.current = setTimeout(runAction, delay);
  }, [
    actionDelayMs,
    clearTimers,
    enabled,
    hapticIntent,
    onPress,
    queueInactiveState,
    reduceMotion,
  ]);

  const animatedTransformStyle = useMemo(
    () => ({ transform: [{ scale: scaleAnim }] }),
    [scaleAnim],
  );

  return {
    isPressActive,
    scaleAnim,
    reduceMotion,
    handlePress,
    handlePressIn,
    handlePressOut,
    animatedTransformStyle,
  };
};
