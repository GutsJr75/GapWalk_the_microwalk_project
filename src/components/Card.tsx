import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp, Platform } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { useTapFeedbackAction } from '../lib/useTapFeedbackAction';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  elevated?: boolean;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  selected = false,
  onPress,
  disabled = false,
  elevated = false,
  testID,
}) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const cardBaseStyle = [
    styles.card,
    {
      backgroundColor: elevated ? palette.bgSurfaceElevated : palette.bgSurface,
      borderColor: palette.borderSoft,
    },
    selected && styles.selectedCard,
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
  const cardBaseStyleWithShadow = [
    ...cardBaseStyle,
    shadowStyle,
  ];
  const { isTapActive, handlePress, handlePressIn, handlePressOut } = useTapFeedbackAction({
    onPress: onPress ?? (() => {}),
    enabled: !!onPress && !disabled,
  });

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          cardBaseStyleWithShadow,
          (pressed || isTapActive) && !disabled && {
            shadowColor: palette.accentPrimary,
            shadowOpacity: isDark ? 0.3 : 0.2,
            shadowRadius: isDark ? 14 : 10,
            elevation: isDark ? 8 : 6,
          },
          pressed && !disabled && styles.pressedCard,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        android_ripple={{ color: rippleColor }}
        testID={testID}
        accessibilityLabel={testID}
      >
        {children}
      </Pressable>
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
  selectedCard: {
    borderColor: theme.colors.accentPrimary,
    borderWidth: 2,
  },
  disabledCard: {
    opacity: 0.4,
  },
  pressedCard: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },
});
