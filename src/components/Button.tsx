import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import { translateLiteral } from '../lib/i18n';

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
  const { themeMode, language } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();
  const localizedTitle = React.useMemo(() => translateLiteral(title, language), [title, language]);
  const isPrimaryLike = variant === 'primary' || variant === 'danger';
  const labelColor = disabled
    ? palette.textMuted
    : variant === 'primary'
      ? theme.colors.bgApp
      : variant === 'danger'
        ? theme.colors.white
        : variant === 'muted'
          ? palette.textMuted
          : palette.textPrimary;
  const spinnerColor = disabled ? palette.textMuted : labelColor;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && {
          backgroundColor: palette.bgSurfaceElevated,
          borderWidth: 1,
          borderColor: palette.borderSoft,
        },
        variant === 'outline' && [
          styles.outlineButton,
          { borderColor: isDark ? '#3d4a66' : palette.borderStrong },
        ],
        variant === 'muted' && styles.mutedButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        full && styles.fullWidth,
        pressed && !disabled && !loading && styles.pressedButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={testID}
      android_ripple={{
        color: isPrimaryLike ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.10)',
      }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: labelColor },
            textStyle,
          ]}
        >
          {localizedTitle}
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
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0,
  },
});
