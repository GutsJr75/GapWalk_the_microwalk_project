import React from 'react';
import { Pressable, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp, Platform } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import { Text } from './Text';
import { useTapFeedbackAction } from '../lib/useTapFeedbackAction';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'muted' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  full?: boolean;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  full = false,
  testID,
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();
  const isPrimaryLike = variant === 'primary' || variant === 'danger';
  const labelColor = disabled
    ? palette.textMuted
    : variant === 'primary'
      ? '#111827'
      : variant === 'danger'
        ? theme.colors.white
        : variant === 'muted'
          ? palette.textMuted
          : palette.textPrimary;
  const spinnerColor = disabled ? palette.textMuted : labelColor;
  const glowColor = variant === 'danger' ? theme.colors.danger : palette.accentPrimary;
  const { isTapActive, handlePress, handlePressIn, handlePressOut } = useTapFeedbackAction({
    onPress,
    enabled: !(disabled || loading),
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && {
          backgroundColor: palette.bgSurface,
          borderWidth: 1,
          borderColor: palette.borderStrong,
        },
        variant === 'outline' && [
          styles.outlineButton,
          { borderColor: palette.borderStrong },
        ],
        variant === 'muted' && styles.mutedButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        full && styles.fullWidth,
        (pressed || isTapActive) && !disabled && !loading && {
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0.18,
          shadowRadius: 10,
          elevation: 5,
        },
        pressed && !disabled && !loading && styles.pressedButton,
        style,
      ]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={testID}
      android_ripple={{
        color: isPrimaryLike ? 'rgba(255,255,255,0.18)' : palette.inputBg,
      }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          variant="body"
          style={[
            styles.buttonText,
            { color: labelColor },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    height: theme.layout.buttonHeight,
    paddingHorizontal: 18,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  fullWidth: {
    width: '100%',
  },
  primaryButton: {
    backgroundColor: theme.colors.accentPrimary,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  mutedButton: {
    backgroundColor: 'transparent',
  },
  dangerButton: {
    backgroundColor: theme.colors.danger,
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressedButton: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0,
  },
});
