import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

type TimerRef = ReturnType<typeof setTimeout> | null;

interface UseTapFeedbackActionOptions {
  onPress: () => void;
  enabled?: boolean;
  actionDelayMs?: number;
  glowHoldMs?: number;
  haptics?: boolean;
}

interface UseTapFeedbackActionResult {
  isTapActive: boolean;
  handlePress: () => void;
  handlePressIn: () => void;
  handlePressOut: () => void;
}

export const useTapFeedbackAction = ({
  onPress,
  enabled = true,
  actionDelayMs = 70,
  glowHoldMs = 120,
  haptics = true,
}: UseTapFeedbackActionOptions): UseTapFeedbackActionResult => {
  const [isTapActive, setIsTapActive] = useState(false);
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

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const handlePressIn = useCallback(() => {
    if (!enabled) return;
    setIsTapActive(true);
  }, [enabled]);

  const handlePressOut = useCallback(() => {
    if (!enabled) return;
    if (actionTimeoutRef.current) return;

    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
    }
    glowTimeoutRef.current = setTimeout(() => {
      setIsTapActive(false);
      glowTimeoutRef.current = null;
    }, Math.max(50, glowHoldMs));
  }, [enabled, glowHoldMs]);

  const handlePress = useCallback(() => {
    if (!enabled) return;

    if (haptics && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
    }
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
    }

    setIsTapActive(true);
    actionTimeoutRef.current = setTimeout(() => {
      actionTimeoutRef.current = null;
      onPress();

      glowTimeoutRef.current = setTimeout(() => {
        setIsTapActive(false);
        glowTimeoutRef.current = null;
      }, Math.max(50, glowHoldMs));
    }, Math.max(0, actionDelayMs));
  }, [actionDelayMs, enabled, glowHoldMs, haptics, onPress]);

  return {
    isTapActive,
    handlePress,
    handlePressIn,
    handlePressOut,
  };
};

