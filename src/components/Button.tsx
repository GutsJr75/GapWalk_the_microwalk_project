import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'muted' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  full?: boolean;
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
}) => {
  const { themeMode } = useAppStore();
  const isDark = themeMode === 'dark';
  const palette = useThemePalette();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && { backgroundColor: palette.bgSurfaceElevated, borderWidth: 1, borderColor: palette.borderSoft },
        variant === 'outline' && [
          styles.outlineButton,
          { borderColor: isDark ? '#3d4a66' : palette.borderStrong },
        ],
        variant === 'muted' && styles.mutedButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        full && styles.fullWidth,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger'
              ? theme.colors.bgApp
              : palette.textPrimary
          }
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && { color: palette.textPrimary },
            variant === 'outline' && { color: palette.textPrimary },
            variant === 'muted' && { color: palette.textMuted },
            variant === 'danger' && styles.dangerText,
            disabled && styles.disabledText,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
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
    opacity: 0.4,
  },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0,
  },
  primaryText: {
    color: theme.colors.bgApp,
  },
  dangerText: {
    color: theme.colors.white,
  },
  disabledText: {
    color: theme.colors.textMuted,
  },
});


