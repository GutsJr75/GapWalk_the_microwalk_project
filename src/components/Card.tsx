import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp, Animated } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { useTapFeedbackAction } from '../hooks/useTapFeedbackAction';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  elevated?: boolean;
  shadowed?: boolean;
  accentBorder?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Card: React.FC<CardProps> = ({
  children,
  style,
  selected = false,
  onPress,
  disabled = false,
  elevated = false,
  shadowed = true,
  accentBorder = false,
  testID,
}) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cardBaseStyle = [
    styles.card,
    {
      backgroundColor: elevated ? palette.bgSurfaceElevated : palette.bgSurface,
      borderColor: accentBorder ? palette.accentBorder : palette.borderSoft,
      borderWidth: accentBorder ? 2 : 1,
    },
    selected && { borderColor: palette.accentPrimary, borderWidth: 2 },
    disabled && styles.disabledCard,
    style,
  ];

  const rippleColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const shadowStyle = elevated
    ? {
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: isDark ? 6 : 3 },
      shadowOpacity: isDark ? 0.20 : 0.14,
      shadowRadius: isDark ? 16 : 10,
      elevation: isDark ? 6 : 4,
    }
    : {
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: isDark ? 4 : 3,
      elevation: isDark ? 2 : 1,
    };
  const cardBaseStyleWithShadow = shadowed
    ? [
      ...cardBaseStyle,
      shadowStyle,
    ]
    : cardBaseStyle;
  const { isTapActive, handlePress, handlePressIn, handlePressOut } = useTapFeedbackAction({
    onPress: onPress ?? (() => { }),
    enabled: !!onPress && !disabled,
  });

  const onPressIn = useCallback(() => {
    handlePressIn();
    if (!disabled) {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        tension: 150,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [scaleAnim, disabled, handlePressIn]);

  const onPressOut = useCallback(() => {
    handlePressOut();
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim, handlePressOut]);

  if (onPress) {
    return (
      <AnimatedPressable
        style={[
          cardBaseStyleWithShadow,
          shadowed && isTapActive && !disabled && {
            shadowColor: palette.accentPrimary,
            shadowOpacity: isDark ? 0.3 : 0.2,
            shadowRadius: isDark ? 14 : 10,
            elevation: isDark ? 8 : 6,
          },
          { transform: [{ scale: scaleAnim }] },
        ]}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        android_ripple={{ color: rippleColor }}
        testID={testID}
        accessibilityLabel={testID}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <View style={cardBaseStyleWithShadow} testID={testID} accessibilityLabel={testID}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bgSurface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    width: '100%',
  },
  disabledCard: {
    opacity: 0.4,
  },
});
