import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Modal,
  useWindowDimensions,
  type LayoutRectangle,
} from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Text } from '../components/Text';
import { theme, appFontFamily } from '../theme';
import { getThemePalette, type ThemeMode } from '../theme/palette';
import { useAppStore } from '../store';

/* ────────────────────────────────────────────────────────────
 *  Step definitions
 * ──────────────────────────────────────────────────────────── */

export interface TourStepDef {
  name: string;
  order: number;
  text: string;
}

export const SCHEDULE_TOUR_STEPS: TourStepDef[] = [
  {
    name: 'sched-hint-bar',
    order: 1,
    text: 'This is your weekly schedule. Each column is a day and each row is a 30-minute time slot.',
  },
  {
    name: 'sched-week-header',
    order: 2,
    text: 'Use the arrows next to the month on the left to switch weeks. You can also slide (swipe) left/right on the weekly header to move between weeks. Tap a day to select it.',
  },
  {
    name: 'sched-grid-body',
    order: 3,
    text: "Tap any empty slot to select it, and a '+' icon appears. Tap it again to open the Add Event form where you set the title, time, and repeat days.",
  },
  {
    name: 'sched-clear-btn',
    order: 4,
    text: 'Select a day, then tap Clear to remove all events for that day.',
  },
  {
    name: 'sched-footer',
    order: 5,
    text: "When you're done adding your busy times, tap Save and then Continue to proceed.",
  },
];

export const SCHEDULE_TOUR_STEPS_IMPORT: TourStepDef[] = [
  SCHEDULE_TOUR_STEPS[0],
  SCHEDULE_TOUR_STEPS[1],
  {
    name: 'sched-grid-body',
    order: 3,
    text: 'Your imported events appear as colored blocks. Tap one to select it, then tap again to view or edit. Tap an empty slot twice to add a new event.',
  },
  SCHEDULE_TOUR_STEPS[3],
  SCHEDULE_TOUR_STEPS[4],
];

export const DASHBOARD_TOUR_STEPS: TourStepDef[] = [
  {
    name: 'dashboard-menu',
    order: 1,
    text: 'Tap the menu icon to access settings, manage your schedule, view your profile, and more.',
  },
  {
    name: 'dashboard-streak',
    order: 2,
    text: 'This is your walking streak. Walk consistently each day to keep your streak alive and build lasting habits.',
  },
  {
    name: 'dashboard-quick-status',
    order: 3,
    text: 'Your daily progress at a glance. Track minutes walked, notification count, and steps toward your goals.',
  },
  {
    name: 'dashboard-opportunities',
    order: 4,
    text: 'These are your upcoming walk windows. GapWalk finds gaps in your schedule and suggests the best times. Tap the + button to add a walk manually.',
  },
  {
    name: 'dashboard-manual-walk',
    order: 5,
    text: 'Tap here anytime to start a walk on demand, even outside your scheduled windows.',
  },
];

/* ────────────────────────────────────────────────────────────
 *  Tour overlay
 * ──────────────────────────────────────────────────────────── */

export interface TourTargetRef {
  ref: React.RefObject<View | null>;
  stepIndex: number;
}

interface TourOverlayProps {
  visible: boolean;
  targets: TourTargetRef[];
  steps: TourStepDef[];
  onFinish: () => void;
  onBeforeStep?: (stepIndex: number) => Promise<void>;
  preferAboveStepIndices?: number[];
  spotlightScaleByStep?: Partial<Record<number, number>>;
  /**
   * Optional reference used to "cut off" the dark backdrop + tap-anywhere layer
   * (so underlying CTA buttons stay visible/clickable during Step 0).
   */
  backdropCutoffRef?: React.RefObject<View | null>;
  /**
   * Optional reference used to clamp spotlight height to a visible viewport.
   * Useful when the step target is inside a ScrollView and is taller than what
   * the user can see at once.
   */
  spotlightClampRef?: React.RefObject<View | null>;
}

const SPOTLIGHT_PADDING = 14;
const SPOTLIGHT_RADIUS = 14;
const PHONE_TOOLTIP_MAX_WIDTH = 300;
const TABLET_TOOLTIP_MAX_WIDTH = 420;
const PHONE_TOOLTIP_MARGIN = 20;
const TABLET_TOOLTIP_MARGIN = 28;
const TABLET_BREAKPOINT = 600;
const ANIMATION_DURATION = 320;
const STEP_TRANSITION_DURATION = 260;
const TOOLTIP_REVEAL_DURATION = 220;
const MEASURE_TIMEOUT_MS = 500;
// Make the non-spotlight area dark enough that underlying CTA buttons
// (e.g. Save/Continue) don't look like tour controls.
const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.88)';
// Bottom fade for Step 0: keep the CTA area less prominent while still allowing
// the user to see/engage it (tap-capture stays cut off below `darkRectHeight`).
const BACKDROP_BOTTOM_COLOR = 'rgba(0, 0, 0, 0.35)';

const buildRoundedRectPath = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string => {
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
  onFinish,
  onBeforeStep,
  preferAboveStepIndices,
  spotlightScaleByStep,
  backdropCutoffRef,
  spotlightClampRef,
}) => {
  const { themeMode } = useAppStore();
  const palette = getThemePalette(themeMode as ThemeMode);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [currentStep, setCurrentStep] = useState(0);
  const [backdropCutoffY, setBackdropCutoffY] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'above' | 'below'>(
    'below',
  );
  const [measuring, setMeasuring] = useState(false);
  const [hasSpotlight, setHasSpotlight] = useState(false);

  const svgSpotRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [svgSpot, setSvgSpot] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const rafPendingRef = useRef(false);

  const modalOffsetRef = useRef({ x: 0, y: 0 });
  const calibrationRef = useRef<View>(null);
  const calibratedRef = useRef(false);

  const busyRef = useRef(false);
  const dismissingRef = useRef(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipTranslateY = useRef(new Animated.Value(12)).current;
  const activeDotScale = useRef(new Animated.Value(1)).current;
  const animSpotX = useRef(new Animated.Value(0)).current;
  const animSpotY = useRef(new Animated.Value(0)).current;
  const animSpotW = useRef(new Animated.Value(0)).current;
  const animSpotH = useRef(new Animated.Value(0)).current;

  const spotXRef = useRef(0);
  const spotYRef = useRef(0);
  const spotWRef = useRef(0);
  const spotHRef = useRef(0);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  const screenHeight = viewportHeight;
  const screenWidth = viewportWidth;
  const isTabletLike = screenWidth >= TABLET_BREAKPOINT;
  const tooltipMargin = isTabletLike ? TABLET_TOOLTIP_MARGIN : PHONE_TOOLTIP_MARGIN;
  const tooltipWidth = Math.min(
    screenWidth - tooltipMargin * 2,
    isTabletLike ? TABLET_TOOLTIP_MAX_WIDTH : PHONE_TOOLTIP_MAX_WIDTH,
  );
  const tooltipOffset = isTabletLike ? 18 : 14;

  /* ── Batch SVG rerenders via rAF ── */

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
      animSpotX.addListener(({ value }) => {
        svgSpotRef.current.x = value;
        scheduleSvgUpdate();
      }),
      animSpotY.addListener(({ value }) => {
        svgSpotRef.current.y = value;
        scheduleSvgUpdate();
      }),
      animSpotW.addListener(({ value }) => {
        svgSpotRef.current.w = value;
        scheduleSvgUpdate();
      }),
      animSpotH.addListener(({ value }) => {
        svgSpotRef.current.h = value;
        scheduleSvgUpdate();
      }),
    ];
    return () => {
      animSpotX.removeListener(ids[0]);
      animSpotY.removeListener(ids[1]);
      animSpotW.removeListener(ids[2]);
      animSpotH.removeListener(ids[3]);
    };
  }, [animSpotX, animSpotY, animSpotW, animSpotH, scheduleSvgUpdate]);

  /* ── Calibrate Modal→screen offset ── */

  const calibrate = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!calibrationRef.current) {
        resolve();
        return;
      }
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          resolve();
        }
      }, MEASURE_TIMEOUT_MS);
      calibrationRef.current.measure(
        (
          _fx: number,
          _fy: number,
          _w: number,
          _h: number,
          pageX: number,
          pageY: number,
        ) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          // Store page coordinates so `measureTarget()` can subtract in the same space.
          modalOffsetRef.current = { x: pageX, y: pageY };
          calibratedRef.current = true;
          resolve();
        },
      );
    });
  }, []);

  /* ── Measure a target view ── */

  const measureTarget = useCallback(
    (stepIdx: number): Promise<LayoutRectangle | null> => {
      return new Promise((resolve) => {
        const targetsForStep = targets.filter((t) => t.stepIndex === stepIdx && !!t.ref?.current);
        if (targetsForStep.length === 0) {
          resolve(null);
          return;
        }

        // Measure every target for this step and return the bounding box union.
        // This is useful for Step 0 where we need a single spotlight hole that spans
        // both the day/date header and the visible grid rows.
        const measureOne = (ref: React.RefObject<View | null>) =>
          new Promise<LayoutRectangle | null>((r) => {
            let done = false;
            const timeout = setTimeout(() => {
              if (done) return;
              done = true;
              r(null);
            }, MEASURE_TIMEOUT_MS);

            // Using .measure() yields more reliable page coordinates for views rendered inside
            // ScrollViews with sticky headers, especially when the measurement originates from a Modal.
            ref.current?.measure(
              (
                _fx: number,
                _fy: number,
                width: number,
                height: number,
                pageX: number,
                pageY: number,
              ) => {
                if (done) return;
                done = true;
                clearTimeout(timeout);
                if (width === 0 && height === 0) {
                  r(null);
                  return;
                }
                const offset = modalOffsetRef.current;
                r({
                  x: pageX - offset.x,
                  y: pageY - offset.y,
                  width,
                  height,
                });
              },
            );
          });

        void Promise.all(targetsForStep.map((t) => measureOne(t.ref))).then((rects) => {
          const valid = rects.filter((x): x is LayoutRectangle => !!x);
          if (valid.length === 0) {
            resolve(null);
            return;
          }

          const minX = Math.min(...valid.map((v) => v.x));
          const minY = Math.min(...valid.map((v) => v.y));
          const maxX = Math.max(...valid.map((v) => v.x + v.width));
          const maxY = Math.max(...valid.map((v) => v.y + v.height));

          resolve({
            x: minX,
            y: minY,
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY),
          });
        });
      });
    },
    [targets],
  );

  /* ── Measure backdrop cutoff top (for Step 0 only) ── */
  const measureBackdropCutoffTop = useCallback((): Promise<number | null> => {
    return new Promise((resolve) => {
      const ref = backdropCutoffRef?.current;
      if (!ref) {
        resolve(null);
        return;
      }

      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, MEASURE_TIMEOUT_MS);

      ref.measure(
        (
          _fx: number,
          _fy: number,
          _w: number,
          _h: number,
          _pageX: number,
          pageY: number,
        ) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);

          const offset = modalOffsetRef.current;
          resolve(pageY - offset.y);
        },
      );
    });
  }, [backdropCutoffRef]);

  /* ── Measure a single ref rect (screen coordinates within Modal root) ── */
  const measureRefRect = useCallback(
    async (ref: React.RefObject<View | null>): Promise<LayoutRectangle | null> => {
      const el = ref.current;
      if (!el) return null;

      return new Promise((resolve) => {
        let done = false;
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          resolve(null);
        }, MEASURE_TIMEOUT_MS);

        el.measure(
          (
            _fx: number,
            _fy: number,
            width: number,
            height: number,
            pageX: number,
            pageY: number,
          ) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);

            if (width === 0 && height === 0) {
              resolve(null);
              return;
            }

            const offset = modalOffsetRef.current;
            resolve({
              x: pageX - offset.x,
              y: pageY - offset.y,
              width,
              height,
            });
          },
        );
      });
    },
    [],
  );

  /* ── Animate spotlight + tooltip to a step ── */

  const animateToStep = useCallback(
    async (stepIdx: number, isInitial = false) => {
      if (busyRef.current || dismissingRef.current) return;
      busyRef.current = true;
      setMeasuring(true);

      if (!isInitial) {
        await new Promise<void>((r) => {
          Animated.parallel([
            Animated.timing(tooltipOpacity, {
              toValue: 0,
              duration: 140,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tooltipTranslateY, {
              toValue: 10,
              duration: 140,
              useNativeDriver: false,
            }),
          ]).start(() => r());
        });
      }

      if (!calibratedRef.current) {
        await calibrate();
      }

      if (onBeforeStep) {
        await onBeforeStep(stepIdx);
      }

      let cutoffY: number | null = null;
      if (stepIdx === 0) {
        cutoffY = backdropCutoffY ?? (await measureBackdropCutoffTop());
        if (cutoffY != null) setBackdropCutoffY(cutoffY);
      }

      const rect = await measureTarget(stepIdx);
      if (!rect) {
        setMeasuring(false);
        busyRef.current = false;
        if (isInitial) onFinish();
        return;
      }

      const isViewportClampedStep =
        !!spotlightClampRef && steps[stepIdx]?.name === 'sched-grid-body';

      const padX = isViewportClampedStep ? 4 : SPOTLIGHT_PADDING;
      const padY = SPOTLIGHT_PADDING;
      let spotlightClampRect: LayoutRectangle | null = null;

      let sX = rect.x - padX;
      let sY = rect.y - padY;
      let sW = rect.width + padX * 2;
      let sH = rect.height + padY * 2;

      if (isViewportClampedStep) {
        const trimLeft = sW * 0.02;
        sX += trimLeft;
        sW -= trimLeft;
      }

      // For Step 0, we want the backdrop + tap-capture to stop at the footer
      // CTA area (so they stay visible/clickable). Also cap the spotlight so
      // it doesn't extend under the footer.
      if (stepIdx === 0 && cutoffY != null) {
        const maxSpotlightHeight = Math.max(0, cutoffY - sY);
        sH = Math.min(sH, maxSpotlightHeight);
      }

      // Step 2: clamp spotlight height to the visible grid viewport.
      // This prevents the spotlight from extending to the full ScrollView
      // content height.
      if (isViewportClampedStep && spotlightClampRef?.current) {
        spotlightClampRect = await measureRefRect(spotlightClampRef);
        if (spotlightClampRect) {
          const visibleTop = spotlightClampRect.y;
          const visibleBottom = spotlightClampRect.y + spotlightClampRect.height;
          const bottomReduce = spotlightClampRect.height * 0.22;
          const clampedBottom = Math.max(visibleTop, visibleBottom - bottomReduce);

          // If the scroll position moves the target view so its top is above
          // the visible viewport, only clamping `sH` can still make the
          // spotlight appear "full screen". Clamp both top and bottom.
          const spotTop = Math.max(visibleTop, sY);
          const spotBottom = Math.min(clampedBottom, sY + sH);

          sY = spotTop;
          sH = Math.max(0, spotBottom - spotTop);
        }
        sH -= sH * 0.08;
      }

      const spotlightScale = spotlightScaleByStep?.[stepIdx] ?? 1;
      if (spotlightScale !== 1) {
        const scaledW = sW * spotlightScale;
        const scaledH = sH * spotlightScale;
        sX -= (scaledW - sW) / 2;
        sY -= (scaledH - sH) / 2;
        sW = scaledW;
        sH = scaledH;

        if (stepIdx === 0 && cutoffY != null) {
          const maxSpotlightHeight = Math.max(0, cutoffY - sY);
          sH = Math.min(sH, maxSpotlightHeight);
        }

        if (isViewportClampedStep && spotlightClampRect) {
          const visibleTop = spotlightClampRect.y;
          const visibleBottom = spotlightClampRect.y + spotlightClampRect.height;
          const bottomReduce = spotlightClampRect.height * 0.22;
          const clampedBottom = Math.max(visibleTop, visibleBottom - bottomReduce);
          const spotTop = Math.max(visibleTop, sY);
          const spotBottom = Math.min(clampedBottom, sY + sH);

          sY = spotTop;
          sH = Math.max(0, spotBottom - spotTop);
        }

        const boundedRight = Math.min(screenWidth, sX + sW);
        sX = Math.max(0, sX);
        sW = Math.max(0, boundedRight - sX);
      }

      spotXRef.current = sX;
      spotYRef.current = sY;
      spotWRef.current = sW;
      spotHRef.current = sH;

      // Some screens need specific steps forced above (e.g. schedule grid cells).
      // Keep it configurable so dashboard steps can choose natural placement.
      const preferAbove = preferAboveStepIndices?.includes(stepIdx) ?? false;
      setTooltipPosition(preferAbove || sY + sH > screenHeight * 0.55 ? 'above' : 'below');

      if (isInitial) {
        animSpotX.setValue(sX);
        animSpotY.setValue(sY);
        animSpotW.setValue(sW);
        animSpotH.setValue(sH);
        svgSpotRef.current = { x: sX, y: sY, w: sW, h: sH };
        setSvgSpot({ x: sX, y: sY, w: sW, h: sH });

        setHasSpotlight(true);
        setCurrentStep(stepIdx);
        setMeasuring(false);

        await new Promise<void>((r) => {
          Animated.parallel([
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: ANIMATION_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tooltipOpacity, {
              toValue: 1,
              duration: ANIMATION_DURATION,
              delay: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tooltipTranslateY, {
              toValue: 0,
              duration: ANIMATION_DURATION,
              delay: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start(() => r());
        });
      } else {
        await new Promise<void>((r) => {
          Animated.parallel([
            Animated.timing(animSpotX, {
              toValue: sX,
              duration: STEP_TRANSITION_DURATION,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotY, {
              toValue: sY,
              duration: STEP_TRANSITION_DURATION,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotW, {
              toValue: sW,
              duration: STEP_TRANSITION_DURATION,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(animSpotH, {
              toValue: sH,
              duration: STEP_TRANSITION_DURATION,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start(() => r());
        });

        setCurrentStep(stepIdx);
        setHasSpotlight(true);
        setMeasuring(false);

        await new Promise<void>((r) => {
          Animated.parallel([
            Animated.timing(tooltipOpacity, {
              toValue: 1,
              duration: TOOLTIP_REVEAL_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tooltipTranslateY, {
              toValue: 0,
              duration: TOOLTIP_REVEAL_DURATION,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]).start(() => r());
        });
      }

      activeDotScale.setValue(0.6);
      Animated.spring(activeDotScale, {
        toValue: 1,
        tension: 300,
        friction: 12,
        useNativeDriver: false,
      }).start();

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* non-critical */
      }

      busyRef.current = false;
    },
    [
      calibrate,
      measureTarget,
      measureRefRect,
      measureBackdropCutoffTop,
      overlayOpacity,
      tooltipOpacity,
      tooltipTranslateY,
      animSpotX,
      animSpotY,
      animSpotW,
      animSpotH,
      activeDotScale,
      screenHeight,
      screenWidth,
      onFinish,
      onBeforeStep,
      preferAboveStepIndices,
      spotlightScaleByStep,
      backdropCutoffY,
      steps,
      spotlightClampRef,
    ],
  );

  /* ── Start tour when visible ── */

  useEffect(() => {
    if (!visible) return;
    setCurrentStep(0);
    setBackdropCutoffY(null);
    setHasSpotlight(false);
    calibratedRef.current = false;
    dismissingRef.current = false;
    busyRef.current = false;
    overlayOpacity.setValue(0);
    tooltipOpacity.setValue(0);
    tooltipTranslateY.setValue(12);
    const timer = setTimeout(() => animateToStep(0, true), 350);
    return () => clearTimeout(timer);
    // Only re-run when visibility toggles; animateToStep is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /* ── Navigation handlers ── */

  const handleFinish = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    busyRef.current = true;
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      onFinish();
    });
  }, [overlayOpacity, tooltipOpacity, onFinish]);

  const handleNext = useCallback(() => {
    if (currentStep + 1 >= steps.length) {
      handleFinish();
      return;
    }
    animateToStep(currentStep + 1);
  }, [currentStep, steps.length, animateToStep, handleFinish]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      animateToStep(currentStep - 1);
    }
  }, [currentStep, animateToStep]);

  /* ── Render ── */

  if (!visible) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const step = steps[currentStep];
  const useBackdropCutoff = isFirst && backdropCutoffY != null;
  const darkRectHeight = useBackdropCutoff ? Math.max(0, backdropCutoffY as number) : screenHeight;

  const spotlightCenterX = spotXRef.current + spotWRef.current / 2;
  const tooltipLeft = hasSpotlight
    ? Math.max(
        tooltipMargin,
        Math.min(
          screenWidth - tooltipWidth - tooltipMargin,
          spotlightCenterX - tooltipWidth / 2,
        ),
      )
    : tooltipMargin;

  // Clamp tooltip so it is always fully visible on screen.
  // The spotlight can be partially covered — the instruction frame cannot.
  const TOOLTIP_SAFE_TOP = 12;
  const TOOLTIP_SAFE_BOTTOM = 12;

  let tooltipTopValue: number | undefined;
  let tooltipBottomValue: number | undefined;

  if (tooltipPosition === 'below') {
    const idealTop = spotYRef.current + spotHRef.current + tooltipOffset;
    if (tooltipHeight > 0) {
      const maxTop = screenHeight - tooltipHeight - TOOLTIP_SAFE_BOTTOM;
      tooltipTopValue = Math.min(idealTop, Math.max(TOOLTIP_SAFE_TOP, maxTop));
    } else {
      tooltipTopValue = idealTop;
    }
  } else {
    const idealBottom = screenHeight - spotYRef.current + tooltipOffset;
    if (tooltipHeight > 0) {
      const maxBottom = screenHeight - tooltipHeight - TOOLTIP_SAFE_TOP;
      tooltipBottomValue = Math.min(idealBottom, Math.max(TOOLTIP_SAFE_BOTTOM, maxBottom));
    } else {
      tooltipBottomValue = idealBottom;
    }
  }

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleFinish}
    >
      <View
        ref={calibrationRef}
        style={overlayStyles.calibrationPoint}
        collapsable={false}
      />

      <View style={overlayStyles.root}>
        {/* Dark backdrop with spotlight hole */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
          pointerEvents="none"
        >
          <Svg width={screenWidth} height={screenHeight}>
            {hasSpotlight ? (
              [
                <SvgPath
                  key="top"
                  d={[
                    useBackdropCutoff
                      ? `M0,0 H${screenWidth} V${darkRectHeight} H0 Z`
                      : `M0,0 H${screenWidth} V${screenHeight} H0 Z`,
                    buildRoundedRectPath(
                      svgSpot.x,
                      svgSpot.y,
                      svgSpot.w,
                      svgSpot.h,
                      SPOTLIGHT_RADIUS,
                    ),
                  ].join(' ')}
                  fill={BACKDROP_COLOR}
                  fillRule="evenodd"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1.5}
                />,
                ...(useBackdropCutoff
                  ? [
                      <SvgPath
                        key="bottom-fade"
                        d={`M0,${darkRectHeight} H${screenWidth} V${screenHeight} H0 Z`}
                        fill={BACKDROP_BOTTOM_COLOR}
                      />,
                    ]
                  : []),
              ]
            ) : (
              useBackdropCutoff ? (
                [
                  <SvgPath
                    key="top"
                    d={`M0,0 H${screenWidth} V${darkRectHeight} H0 Z`}
                    fill={BACKDROP_COLOR}
                  />,
                  <SvgPath
                    key="bottom-fade"
                    d={`M0,${darkRectHeight} H${screenWidth} V${screenHeight} H0 Z`}
                    fill={BACKDROP_BOTTOM_COLOR}
                  />,
                ]
              ) : (
                <SvgPath
                  d={`M0,0 H${screenWidth} V${screenHeight} H0 Z`}
                  fill={BACKDROP_COLOR}
                />
              )
            )}
          </Svg>
        </Animated.View>

        {/* Swallow all taps outside the instruction card while the tour is active. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => undefined}
          accessibilityRole="none"
          accessible={false}
        />

        {/* Tooltip card */}
        {hasSpotlight && !measuring && (
          <Animated.View
            pointerEvents="box-none"
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && h !== tooltipHeight) setTooltipHeight(h);
            }}
            style={[
              overlayStyles.tooltipContainer,
              {
                backgroundColor: palette.bgSurfaceElevated,
                borderColor: palette.borderSoft,
                borderWidth: 1,
                shadowColor: palette.shadow,
                left: tooltipLeft,
                width: tooltipWidth,
                maxWidth: tooltipWidth,
                opacity: tooltipOpacity,
                transform: [{ translateY: tooltipTranslateY }],
                borderRadius: isTabletLike ? 16 : 12,
                padding: isTabletLike ? 22 : 18,
                gap: isTabletLike ? 14 : 12,
                shadowRadius: isTabletLike ? 16 : 12,
                ...(tooltipTopValue !== undefined
                  ? { top: tooltipTopValue }
                  : {}),
                ...(tooltipBottomValue !== undefined
                  ? { bottom: tooltipBottomValue }
                  : {}),
              },
            ]}
          >
            {/* Progress dots */}
            <View style={overlayStyles.dotsRow}>
              {steps.map((_, i) => {
                const isActive = i === currentStep;
                return isActive ? (
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
                ) : (
                  <View
                    key={i}
                    style={[
                      overlayStyles.dot,
                      {
                        backgroundColor:
                          i < currentStep
                            ? palette.accentPrimary
                            : palette.borderSoft,
                        width: 6,
                        opacity: i < currentStep ? 0.5 : 1,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Step text */}
            <Text
              variant="body"
              style={[
                overlayStyles.stepText,
                isTabletLike && overlayStyles.stepTextTablet,
              ]}
            >
              {step?.text ?? ''}
            </Text>

            {/* Action buttons
             * Step 0 shows the `Next` button in-card. Additionally, the backdrop +
             * tap-capture layer is cut off above the footer CTA area so the user
             * can still see/click the underlying actions.
             */}
            <View style={overlayStyles.actionsRow}>
              {!isFirst && (
                <Pressable
                  onPress={handlePrev}
                  style={({ pressed }) => [
                    overlayStyles.btn,
                    overlayStyles.btnOutline,
                    { borderColor: palette.borderStrong },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={[
                      overlayStyles.btnOutlineText,
                      isTabletLike && overlayStyles.btnTextTablet,
                    ]}
                    color={palette.textMuted}
                  >
                    Back
                  </Text>
                </Pressable>
              )}

              {!isFirst && !isLast && (
                <Pressable
                  onPress={handleFinish}
                  style={({ pressed }) => [
                    overlayStyles.btn,
                    overlayStyles.btnOutline,
                    { borderColor: palette.borderStrong },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={[
                      overlayStyles.btnOutlineText,
                      isTabletLike && overlayStyles.btnTextTablet,
                    ]}
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
                  { backgroundColor: palette.accentPrimary },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text
                  variant="bodySmall"
                  style={[
                    overlayStyles.btnPrimaryText,
                    isTabletLike && overlayStyles.btnTextTablet,
                  ]}
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
  stepTextTablet: {
    fontSize: theme.fontSize.md,
    lineHeight: 24,
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
  btnPrimary: {},
  btnPrimaryText: {
    fontFamily: appFontFamily.medium,
    fontSize: 13,
  },
  btnTextTablet: {
    fontSize: theme.fontSize.sm,
  },
});
