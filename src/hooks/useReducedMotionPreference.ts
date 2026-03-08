import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export const useReducedMotionPreference = (): { reduceMotion: boolean } => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setReduceMotion(false);
      return;
    }

    let active = true;
    const updatePreference = async () => {
      try {
        const enabled = await AccessibilityInfo.isReduceMotionEnabled();
        if (active) {
          setReduceMotion(enabled);
        }
      } catch {
        if (active) {
          setReduceMotion(false);
        }
      }
    };

    void updatePreference();

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return { reduceMotion };
};
