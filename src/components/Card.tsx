import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

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
        shadowColor: isDark ? palette.shadow : 'rgba(15,23,42,0.22)',
        shadowOffset: { width: 0, height: isDark ? 6 : 3 },
        shadowOpacity: isDark ? 0.20 : 0.14,
        shadowRadius: isDark ? 16 : 10,
        elevation: isDark ? 6 : 4,
      }
    : {
        shadowColor: isDark ? palette.shadow : 'rgba(15,23,42,0.12)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.08 : 0.06,
        shadowRadius: isDark ? 4 : 3,
        elevation: isDark ? 2 : 1,
      };
  const cardBaseStyleWithShadow = [
    ...cardBaseStyle,
    shadowStyle,
  ];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          cardBaseStyleWithShadow,
          pressed && !disabled && styles.pressedCard,
        ]}
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress();
        }}
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
    paddingVertical: 14,
    paddingHorizontal: 16,
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
