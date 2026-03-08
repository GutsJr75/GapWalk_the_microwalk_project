import { Easing, LayoutAnimation, type LayoutAnimationConfig } from 'react-native';

export const motion = {
  duration: {
    instant: 90,
    fast: 140,
    standard: 220,
    deliberate: 320,
    slow: 420,
  },
  distance: {
    micro: 4,
    small: 8,
    medium: 12,
    large: 18,
    modal: 26,
  },
  scale: {
    pressSubtle: 0.985,
    pressStandard: 0.965,
    pressDeep: 0.94,
  },
  opacity: {
    pressed: 0.82,
    resting: 1,
  },
  easing: {
    entrance: Easing.out(Easing.cubic),
    exit: Easing.in(Easing.cubic),
    standard: Easing.inOut(Easing.cubic),
    pulse: Easing.inOut(Easing.sin),
    menu: Easing.bezier(0.25, 0.1, 0.25, 1),
    emphasized: Easing.out(Easing.back(1.05)),
  },
  spring: {
    pressIn: {
      tension: 210,
      friction: 18,
    },
    pressOut: {
      tension: 190,
      friction: 16,
    },
    entrance: {
      tension: 90,
      friction: 14,
    },
    settle: {
      tension: 120,
      friction: 14,
    },
    emphasis: {
      tension: 150,
      friction: 16,
    },
  },
} as const;

export const getMotionDuration = (
  reduceMotion: boolean,
  duration: number,
  reducedDuration: number = Math.min(duration, motion.duration.fast),
): number => (reduceMotion ? reducedDuration : duration);

export const getMotionDistance = (
  reduceMotion: boolean,
  distance: number,
  reducedDistance: number = 0,
): number => (reduceMotion ? reducedDistance : distance);

export const createLayoutMotionConfig = (reduceMotion: boolean): LayoutAnimationConfig => ({
  duration: getMotionDuration(
    reduceMotion,
    motion.duration.standard,
    motion.duration.fast,
  ),
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
});
