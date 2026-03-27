import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from './Text';
import { theme } from '../theme';
import { withAlpha } from '../theme/colorUtils';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { usePressMotion } from '../hooks/usePressMotion';
import { motion } from '../theme/motion';

export interface InfoAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveInfoState {
  id: string;
  text: string;
  anchor: InfoAnchorRect;
}

interface InfoTipButtonProps {
  id: string;
  text: string;
  activeInfoId: string | null;
  onToggle: (next: ActiveInfoState) => void;
  testID?: string;
}

export const InfoTipButton: React.FC<InfoTipButtonProps> = ({
  id,
  text,
  activeInfoId,
  onToggle,
  testID,
}) => {
  const anchorRef = useRef<View>(null);
  const { themeMode } = useAppStore();
  const palette = useThemePalette();
  const isDark = themeMode === 'dark';
  const isActive = activeInfoId === id;
  const {
    animatedTransformStyle,
    isPressActive,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = usePressMotion({
    onPress: () => {
      if (!anchorRef.current) return;
      anchorRef.current.measureInWindow((x, y, width, height) => {
        onToggle({
          id,
          text,
          anchor: { x, y, width, height },
        });
      });
    },
    hapticIntent: 'selection',
    pressScale: motion.scale.pressSubtle,
  });

  return (
    <View ref={anchorRef} collapsable={false} style={styles.infoWrap}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={10}
        style={styles.infoBtn}
        testID={testID}
      >
        <Animated.View
          style={[
            styles.infoCircle,
            { borderColor: palette.accentPrimary },
            isActive && { backgroundColor: withAlpha(palette.accentPrimary, isDark ? 0.16 : 0.12) },
            isPressActive && { backgroundColor: withAlpha(palette.accentPrimary, isDark ? 0.2 : 0.14) },
            animatedTransformStyle,
          ]}
        >
          <Text
            style={[
              styles.infoLetter,
              { color: palette.accentPrimary },
            ]}
          >
            i
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
};

interface InfoTooltipOverlayProps {
  activeInfo: ActiveInfoState | null;
  onDismiss: () => void;
}

export const InfoTooltipOverlay: React.FC<InfoTooltipOverlayProps> = ({
  activeInfo,
  onDismiss,
}) => {
  const { themeMode } = useAppStore();
  const palette = useThemePalette();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const isDark = themeMode === 'dark';

  const position = useMemo(() => {
    if (!activeInfo) return null;
    const tooltipWidth = Math.min(280, Math.max(220, viewportWidth - 32));
    const anchorCenter = activeInfo.anchor.x + (activeInfo.anchor.width / 2);
    const clampedLeft = Math.min(
      Math.max(16, anchorCenter - (tooltipWidth / 2)),
      Math.max(16, viewportWidth - tooltipWidth - 16),
    );
    const estimatedHeight = 160;
    const belowTop = activeInfo.anchor.y + activeInfo.anchor.height + 10;
    const aboveTop = activeInfo.anchor.y - estimatedHeight - 10;
    const top = belowTop + estimatedHeight <= viewportHeight - 16
      ? belowTop
      : Math.max(16, aboveTop);
    return {
      left: clampedLeft,
      top,
      width: tooltipWidth,
    };
  }, [activeInfo, viewportHeight, viewportWidth]);

  if (!activeInfo || !position) return null;

  return (
    <RNModal
      transparent
      visible
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlayRoot}>
        <Pressable style={styles.overlayBackdrop} onPress={onDismiss} />
        <View
          style={[
            styles.overlayCard,
            {
              backgroundColor: isDark ? theme.colors.bgSurface : palette.bgSurfaceElevated,
              borderColor: withAlpha(palette.accentPrimary, isDark ? 0.36 : 0.32),
              shadowColor: palette.shadow,
              left: position.left,
              top: position.top,
              width: position.width,
            },
          ]}
        >
          <Text variant="bodySmall" style={styles.overlayText}>
            {activeInfo.text}
          </Text>
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  infoWrap: {
    position: 'relative',
    zIndex: 100,
  },
  infoBtn: {
    padding: 2,
  },
  infoCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLetter: {
    fontSize: 9,
    fontWeight: theme.fontWeight.bold,
    lineHeight: 11,
    textAlign: 'center',
  },
  overlayRoot: {
    flex: 1,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayCard: {
    position: 'absolute',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  overlayText: {
    color: theme.colors.textPrimary,
    lineHeight: 19,
    fontSize: theme.fontSize.sm,
  },
});
