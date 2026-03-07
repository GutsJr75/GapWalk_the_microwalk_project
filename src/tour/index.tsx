import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  Easing,
  Dimensions,
  Modal,
  StatusBar,
  type LayoutRectangle,
  type ScrollView,
} from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Text } from '../components/Text';
import { theme, appFontFamily } from '../theme';
import { getThemePalette, type ThemeMode } from '../theme/palette';
import { useAppStore } from '../store';

/* ────────────────────────────────────────────────────────────
 *  Tour Step Definitions
 * ──────────────────────────────────────────────────────────── */

export interface TourStepDef {
  name: string;
  order: number;
  text: string;
}

export const DASHBOARD_TOUR_STEPS: TourStepDef[] = [
  {
    name: 'dash-menu',
    order: 1,
    text: 'Tap here to access your profile, schedule, preferences, and more.',
  },
  {
    name: 'dash-quick-status',
    order: 2,
    text: 'Your daily walking target, notifications, and step goal at a glance.',
  },
  {
    name: 'dash-opportunities',
    order: 3,
    text: 'Your upcoming walk windows. Tap Change or Cancel to adjust them.',
  },
  {
    name: 'dash-add-walk',
    order: 4,
    text: "Tap '+' to schedule a new MicroWalk at any time you choose.",
  },
  {
    name: 'dash-manual-walk',
    order: 5,
    text: "Start walking right now — no schedule needed! That's the tour, happy walking!",
  },
];

/* ────────────────────────────────────────────────────────────
 *  Tour Overlay Component (Google-style spotlight)
 *
 *  Uses a Modal with coordinate calibration: an invisible ref
 *  at the top of the Modal is measured via measureInWindow to
 *  determine the exact offset between the app's coordinate space
 *  and the Modal's coordinate space. This guarantees pixel-
 *  perfect spotlight alignment.
 * ──────────────────────────────────────────────────────────── */

export interface TourTargetRef {
  ref: React.RefObject<View | null>;
  stepIndex: number;
}

interface TourOverlayProps {
  visible: boolean;
  targets: TourTargetRef[];
  steps: TourStepDef[];
  scrollViewRef?: React.RefObject<ScrollView | null>;
  onFinish: () => void;
}

const SPOTLIGHT_PADDING = 18;  // increased to prevent corner clipping
const SPOTLIGHT_RADIUS = 16;   // reduced so corners don't eat into content
const TOOLTIP_MAX_WIDTH = 300;
const TOOLTIP_MARGIN = 20;
// Slightly longer to feel smoother and more intentional
const ANIMATION_DURATION = 340;
const SCROLL_SETTLE_MS = 420;

const MANUAL_OFFSET_X = 4;
const MANUAL_OFFSET_Y = 0;

/** Build an SVG rounded-rect path string (clockwise, so evenodd punches a hole). */
const buildRoundedRectPath = (x: number, y: number, w: number, h: number, r: number): string => {
  const sr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + sr},${y}`,
    `H${x + w - sr}`,
    `Q${x + w},${y} ${x + w},${y + sr}`,
    `V${y + h - sr}`,
    `Q${x + w},${y + h} ${x + w - sr},${y + h}`,
    `H${x + sr}`,
    `Q${x},${y + h} ${x},${y + h - sr}`,
    `V${y + sr}`,
    `Q${x},${y} ${x + sr},${y} Z`,
  ].join(' ');
};

export const TourOverlay: React.FC<TourOverlayProps> = ({
  visible,
  targets,
  steps,
  scrollViewRef,
  onFinish,
}) => {
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode as ThemeMode);

  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState<'above' | 'below'>('below');
  const [measuring, setMeasuring] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSpotlight, setHasSpotlight] = useState(false);

  // For SVG overlay: JS-thread tracking of current animated spot values
  const svgSpotRef = useRef({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    scale: 1,
    radius: SPOTLIGHT_RADIUS,
    strokePulse: 0,
  });
  const [svgSpot, setSvgSpot] = useState({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    scale: 1,
    radius: SPOTLIGHT_RADIUS,
    strokePulse: 0,
  });
  const rafPendingRef = useRef(false);

  // The offset between measure page coordinates and the Modal's coordinate space
  const modalOffsetRef = useRef({ x: 0, y: 0 });
  const calibrationRef = useRef<View>(null);
  const calibrated = useRef(false);

  // Animations — all use useNativeDriver: false to avoid mixing issues with layout props
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipTranslateY = useRef(new Animated.Value(12)).current;

  // Micro-animation for the active progress dot
  const activeDotScale = useRef(new Animated.Value(1)).current;

  // Animated spotlight dimensions
  const animSpotX = useRef(new Animated.Value(0)).current;
  const animSpotY = useRef(new Animated.Value(0)).current;
  const animSpotW = useRef(new Animated.Value(0)).current;
  const animSpotH = useRef(new Animated.Value(0)).current;

  // Micro-animations for the spotlight “curved box”
  const animSpotScale = useRef(new Animated.Value(1)).current;
  const animSpotRadius = useRef(new Animated.Value(SPOTLIGHT_RADIUS)).current;
  const animSpotStrokePulse = useRef(new Animated.Value(0)).current;

  // Track the raw values for tooltip positioning
  const spotXRef = useRef(0);
  const spotYRef = useRef(0);
  const spotWRef = useRef(0);
  const spotHRef = useRef(0);

  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  // Keep svgSpot in sync with Animated values (JS thread, batched via rAF)
  const scheduleSvgUpdate = useCallback(() => {
    if (!rafPendingRef.current) {
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        setSvgSpot({ ...svgSpotRef.current });
      });
    }
  }, []);

  useEffect(() => {
    const ids = [
      animSpotX.addListener(({ value }) => { svgSpotRef.current.x = value; scheduleSvgUpdate(); }),
      animSpotY.addListener(({ value }) => { svgSpotRef.current.y = value; scheduleSvgUpdate(); }),
      animSpotW.addListener(({ value }) => { svgSpotRef.current.w = value; scheduleSvgUpdate(); }),
      animSpotH.addListener(({ value }) => { svgSpotRef.current.h = value; scheduleSvgUpdate(); }),
      animSpotScale.addListener(({ value }) => { svgSpotRef.current.scale = value; scheduleSvgUpdate(); }),
      animSpotRadius.addListener(({ value }) => { svgSpotRef.current.radius = value; scheduleSvgUpdate(); }),
      animSpotStrokePulse.addListener(({ value }) => { svgSpotRef.current.strokePulse = value; scheduleSvgUpdate(); }),
    ];
    return () => {
      animSpotX.removeListener(ids[0]);
      animSpotY.removeListener(ids[1]);
      animSpotW.removeListener(ids[2]);
      animSpotH.removeListener(ids[3]);
      animSpotScale.removeListener(ids[4]);
      animSpotRadius.removeListener(ids[5]);
      animSpotStrokePulse.removeListener(ids[6]);
    };
  }, [animSpotX, animSpotY, animSpotW, animSpotH, animSpotScale, animSpotRadius, animSpotStrokePulse, scheduleSvgUpdate]);

  // Calibrate: measure where (0,0) in the Modal maps to in page coordinates
  const calibrate = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!calibrationRef.current) {
        resolve();
        return;
      }
      calibrationRef.current.measureInWindow((mx, my) => {
        modalOffsetRef.current = { x: mx, y: my };
        calibrated.current = true;
        resolve();
      });
    });
  }, []);

  const measureTarget = useCallback(
    (stepIdx: number): Promise<LayoutRectangle | null> => {
      return new Promise((resolve) => {
        const target = targets.find((t) => t.stepIndex === stepIdx);
        if (!target?.ref?.current) {
          resolve(null);
          return;
        }
        target.ref.current.measure((_x, _y, width, height, pageX, pageY) => {
          if (width === 0 && height === 0) {
            resolve(null);
            return;
          }
          // Apply calibration offset: convert from page coords to Modal coords
          const offset = modalOffsetRef.current;
          resolve({
            x: pageX - offset.x + MANUAL_OFFSET_X,
            y: pageY - offset.y + MANUAL_OFFSET_Y,
            width,
            height,
          });
        });
      });
    },
    [targets]
  );

  const scrollToAndMeasure = useCallback(
    async (stepIdx: number): Promise<LayoutRectangle | null> => {
      const rect = await measureTarget(stepIdx);

      if (rect && rect.y >= 0 && rect.y + rect.height <= screenHeight) {
        return rect;
      }

      if (scrollViewRef?.current) {
        const target = targets.find((t) => t.stepIndex === stepIdx);
        if (target?.ref?.current) {
          target.ref.current.measureLayout(
            scrollViewRef.current as any,
            (_x: number, y: number) => {
              const scrollTarget = Math.max(0, y - screenHeight / 3);
              scrollViewRef.current?.scrollTo({ y: scrollTarget, animated: true });
            },
            () => { }
          );

          return new Promise((resolve) => {
            setTimeout(async () => {
              const newRect = await measureTarget(stepIdx);
              resolve(newRect);
            }, SCROLL_SETTLE_MS);
          });
        }
      }

      return rect;
    },
    [measureTarget, screenHeight, scrollViewRef, targets]
  );

  const animateToStep = useCallback(
    async (stepIdx: number, isInitial = false) => {
      setMeasuring(true);

      // Fade out tooltip
      if (!isInitial) {
        await new Promise<void>((resolve) => {
          Animated.parallel([
            Animated.timing(tooltipOpacity, {
              toValue: 0,
              duration: 140,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tooltipTranslateY, {
              toValue: 8,
              duration: 140,
              useNativeDriver: false,
            }),
          ]).start(() => resolve());
        });
      }

      // Ensure calibration is done
      if (!calibrated.current) {
        await calibrate();
      }

      const rect = await scrollToAndMeasure(stepIdx);

      if (rect) {
        const nextX = rect.x - SPOTLIGHT_PADDING;
        const nextY = rect.y - SPOTLIGHT_PADDING;
        const nextW = rect.width + SPOTLIGHT_PADDING * 2;
        const nextH = rect.height + SPOTLIGHT_PADDING * 2;

        spotXRef.current = nextX;
        spotYRef.current = nextY;
        spotWRef.current = nextW;
        spotHRef.current = nextH;

        // Decide tooltip position based on future space
        const spaceBelow = screenHeight - (nextY + nextH);
        setTooltipPosition(spaceBelow > 200 ? 'below' : 'above');

        if (isInitial || !hasSpotlight) {
          // Snap instantly if it's the first step
          animSpotX.setValue(nextX);
          animSpotY.setValue(nextY);
          animSpotW.setValue(nextW);
          animSpotH.setValue(nextH);
          animSpotScale.setValue(0.9);
          animSpotRadius.setValue(SPOTLIGHT_RADIUS + 4);
          animSpotStrokePulse.setValue(1);
          setHasSpotlight(true);

          // Gentle reveal micro-animation for the very first step
          Animated.parallel([
            Animated.spring(animSpotScale, {
              toValue: 1,
              tension: 150,
              friction: 18,
              useNativeDriver: false,
            }),
            Animated.timing(animSpotRadius, {
              toValue: SPOTLIGHT_RADIUS,
              duration: 260,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotStrokePulse, {
              toValue: 0,
              duration: 260,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start();
        } else {
          // Smooth animate to new position with playful micro-animations
          const moveAnim = Animated.parallel([
            Animated.timing(animSpotX, {
              toValue: nextX,
              duration: ANIMATION_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotY, {
              toValue: nextY,
              duration: ANIMATION_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotW, {
              toValue: nextW,
              duration: ANIMATION_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotH, {
              toValue: nextH,
              duration: ANIMATION_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]);

          const microAnim = Animated.sequence([
            Animated.parallel([
              Animated.timing(animSpotScale, {
                toValue: 1.04,
                duration: Math.round(ANIMATION_DURATION * 0.45),
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
              Animated.timing(animSpotRadius, {
                toValue: SPOTLIGHT_PADDING + SPOTLIGHT_RADIUS > 24 ? SPOTLIGHT_RADIUS + 4 : SPOTLIGHT_RADIUS + 6,
                duration: Math.round(ANIMATION_DURATION * 0.45),
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
              Animated.timing(animSpotStrokePulse, {
                toValue: 1,
                duration: Math.round(ANIMATION_DURATION * 0.35),
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
            ]),
            Animated.parallel([
              Animated.spring(animSpotScale, {
                toValue: 1,
                tension: 160,
                friction: 18,
                useNativeDriver: false,
              }),
              Animated.timing(animSpotRadius, {
                toValue: SPOTLIGHT_RADIUS,
                duration: Math.round(ANIMATION_DURATION * 0.55),
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
              Animated.timing(animSpotStrokePulse, {
                toValue: 0,
                duration: Math.round(ANIMATION_DURATION * 0.55),
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }),
            ]),
          ]);

          Animated.parallel([moveAnim, microAnim]).start();
        }
      }

      setCurrentStep(stepIdx);
      setMeasuring(false);

      // Fade in tooltip (slight stagger so the spotlight motion leads)
      const direction = tooltipPosition === 'below' ? 12 : -12;
      tooltipTranslateY.setValue(direction);
      activeDotScale.setValue(0.8);
      Animated.sequence([
        Animated.delay(70),
        Animated.parallel([
          Animated.timing(tooltipOpacity, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.spring(tooltipTranslateY, {
            toValue: 0,
            tension: 140,
            friction: 16,
            useNativeDriver: false,
          }),
          Animated.spring(activeDotScale, {
            toValue: 1,
            tension: 160,
            friction: 18,
            useNativeDriver: false,
          }),
        ]),
      ]).start();
    },
    [
      scrollToAndMeasure,
      screenHeight,
      tooltipOpacity,
      tooltipTranslateY,
      tooltipPosition,
      calibrate,
      hasSpotlight,
      animSpotH,
      animSpotW,
      animSpotX,
      animSpotY
    ]
  );

  // Start / reset
  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
      setReady(false);
      setHasSpotlight(false);
      calibrated.current = false;
      overlayOpacity.setValue(0);
      tooltipOpacity.setValue(0);
      return;
    }

    // Fade in overlay
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Wait for Modal to mount, calibrate, then start
    const timer = setTimeout(async () => {
      await calibrate();
      setReady(true);
      void animateToStep(0, true);
    }, 700);

    return () => clearTimeout(timer);
  }, [visible]);

  const hapticTap = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    }
  };

  const handleNext = () => {
    hapticTap();
    if (currentStep >= steps.length - 1) {
      handleFinish();
    } else {
      void animateToStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    hapticTap();
    if (currentStep > 0) {
      void animateToStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    hapticTap();
    handleFinish();
  };

  const handleFinish = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animSpotScale, {
        toValue: 0.9,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animSpotRadius, {
        toValue: SPOTLIGHT_RADIUS + 4,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animSpotStrokePulse, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      onFinish();
    });
  };

  if (!visible) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const step = steps[currentStep];

  const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.75)';

  // Tooltip position (uses refs since it doesn't need to animate during transit)
  const spotX = spotXRef.current;
  const spotY = spotYRef.current;
  const spotH = spotHRef.current;

  const tooltipLeft =
    hasSpotlight
      ? Math.max(
        TOOLTIP_MARGIN,
        Math.min(screenWidth - TOOLTIP_MAX_WIDTH - TOOLTIP_MARGIN, spotX)
      )
      : TOOLTIP_MARGIN;

  const tooltipTopValue =
    tooltipPosition === 'below'
      ? spotY + spotH + 14
      : undefined;

  const tooltipBottomValue =
    tooltipPosition === 'above'
      ? screenHeight - spotY + 14
      : undefined;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={handleFinish}>
      {/* Calibration point: invisible View at Modal origin to compute offset */}
      <View
        ref={calibrationRef}
        style={overlayStyles.calibrationPoint}
        collapsable={false}
      />

      <View style={overlayStyles.root}>
        {/* ── SVG overlay: full screen dark mask with a rounded-rect hole punched out ── */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
          pointerEvents="auto"
        >
          <Svg width={screenWidth} height={screenHeight}>
            {hasSpotlight ? (() => {
              const { x, y, w, h, scale, radius, strokePulse } = svgSpot;
              const effectiveScale = typeof scale === 'number' && !Number.isNaN(scale) ? scale : 1;
              const effectiveRadius = typeof radius === 'number' && !Number.isNaN(radius) ? radius : SPOTLIGHT_RADIUS;
              const cx = x + w / 2;
              const cy = y + h / 2;
              const scaledW = w * effectiveScale;
              const scaledH = h * effectiveScale;
              const drawX = cx - scaledW / 2;
              const drawY = cy - scaledH / 2;
              const pulse = typeof strokePulse === 'number' && !Number.isNaN(strokePulse) ? strokePulse : 0;
              const strokeAlpha = 0.16 + 0.26 * Math.max(0, Math.min(1, pulse));

              return (
                <SvgPath
                  d={[
                    `M0,0 H${screenWidth} V${screenHeight} H0 Z`,
                    buildRoundedRectPath(drawX, drawY, scaledW, scaledH, effectiveRadius),
                  ].join(' ')}
                  fill={BACKDROP_COLOR}
                  fillRule="evenodd"
                  stroke={`rgba(255,255,255,${strokeAlpha.toFixed(3)})`}
                  strokeWidth={1.5}
                />
              );
            })() : (
              <SvgPath
                d={`M0,0 H${screenWidth} V${screenHeight} H0 Z`}
                fill={BACKDROP_COLOR}
              />
            )}
          </Svg>
        </Animated.View>

        {/* Tap on spotlight to advance */}
        {hasSpotlight && (
          <Pressable
            style={[
              overlayStyles.spotlightTouch,
              { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } // A full pressable is easier to prevent event swallowing, or we connect it.
              // Wait, let's just make the cutout area pressable: 
            ]}
            onPress={handleNext}
          >
            <Animated.View style={{
              position: 'absolute',
              left: animSpotX,
              top: animSpotY,
              width: animSpotW,
              height: animSpotH,
            }} />
          </Pressable>
        )}

        {/* ── Tooltip (Google Material style) ── */}
        {hasSpotlight && !measuring && (
          <Animated.View
            style={[
              overlayStyles.tooltipContainer,
              {
                backgroundColor: palette.bgSurfaceElevated,
                borderColor: palette.borderSoft,
                borderWidth: 1,
                shadowColor: palette.shadow,
                left: tooltipLeft,
                maxWidth: TOOLTIP_MAX_WIDTH,
                opacity: tooltipOpacity,
                transform: [{ translateY: tooltipTranslateY }],
                ...(tooltipTopValue !== undefined ? { top: tooltipTopValue } : {}),
                ...(tooltipBottomValue !== undefined ? { bottom: tooltipBottomValue } : {}),
              },
            ]}
          >
            {/* Progress dots */}
            <View style={overlayStyles.dotsRow}>
              {steps.map((_, i) => {
                const isActive = i === currentStep;
                if (isActive) {
                  return (
                    <Animated.View
                      key={i}
                      style={[
                        overlayStyles.dot,
                        {
                          backgroundColor: palette.accentPrimary,
                          width: 16,
                          transform: [{ scale: activeDotScale }],
                        },
                      ]}
                    />
                  );
                }

                return (
                  <View
                    key={i}
                    style={[
                      overlayStyles.dot,
                      {
                        backgroundColor: palette.borderSoft,
                        width: 6,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Step text */}
            <Text variant="body" style={overlayStyles.stepText}>
              {step?.text ?? ''}
            </Text>

            {/* Buttons */}
            <View style={overlayStyles.actionsRow}>
              {!isFirst && (
                <Pressable
                  onPress={handlePrev}
                  style={({ pressed }) => [
                    overlayStyles.btn,
                    overlayStyles.btnOutline,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: 'transparent',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={overlayStyles.btnOutlineText}
                    color={palette.textMuted}
                  >
                    Back
                  </Text>
                </Pressable>
              )}

              {!isLast && (
                <Pressable
                  onPress={handleSkip}
                  style={({ pressed }) => [
                    overlayStyles.btn,
                    overlayStyles.btnOutline,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: 'transparent',
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={overlayStyles.btnOutlineText}
                    color={palette.textMuted}
                  >
                    Skip
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleNext}
                style={({ pressed }) => [
                  overlayStyles.btn,
                  overlayStyles.btnPrimary,
                  {
                    backgroundColor: palette.accentPrimary,
                  },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text
                  variant="bodySmall"
                  style={overlayStyles.btnPrimaryText}
                  color={palette.accentOnSolid}
                >
                  {isLast ? 'Got it' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
};

const overlayStyles = StyleSheet.create({
  calibrationPoint: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  overlayRect: {
    position: 'absolute',
  },
  fullBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  spotlightTouch: {
    position: 'absolute',
    zIndex: 10,
  },
  tooltipContainer: {
    position: 'absolute',
    borderRadius: 12,
    padding: 18,
    gap: 12,
    zIndex: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  stepText: {
    fontFamily: appFontFamily.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    borderWidth: 1,
  },
  btnOutlineText: {
    fontFamily: appFontFamily.medium,
    fontSize: 13,
  },
  btnPrimary: {
  },
  btnPrimaryText: {
    fontFamily: appFontFamily.medium,
    fontSize: 13,
  },
});
