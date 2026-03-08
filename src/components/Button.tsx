import React, { useRef, useCallback } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp, Platform, Animated } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { withAlpha } from '../theme/colorUtils';
import { Text } from './Text';
import { useTapFeedbackAction } from '../hooks/useTapFeedbackAction';
import { toDisplayTitleCase } from '../utils/textCase';

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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const palette = useThemePalette();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isPrimaryLike = variant === 'primary';
  const isDanger = variant === 'danger';
  const showPressGlow = isPrimaryLike;
  const dangerTone = theme.colors.danger;
  const dangerBg = withAlpha(dangerTone, 0.12);
  const dangerBorder = withAlpha(dangerTone, 0.38);
  const labelColor = disabled
    ? palette.textMuted
    : variant === 'primary'
      ? palette.accentOnSolid
    : variant === 'danger'
        ? dangerTone
        : variant === 'muted'
          ? palette.textMuted
          : palette.textPrimary;
  const spinnerColor = disabled ? palette.textMuted : labelColor;
  const glowColor = variant === 'danger' ? theme.colors.danger : palette.accentPrimary;
  const displayTitle = React.useMemo(() => toDisplayTitleCase(title), [title]);
  const { isTapActive, handlePress, handlePressIn, handlePressOut } = useTapFeedbackAction({
    onPress,
    enabled: !(disabled || loading),
  });

  const onPressIn = useCallback(() => {
    handlePressIn();
    if (!disabled && !loading) {
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        tension: 150,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [scaleAnim, disabled, loading, handlePressIn]);

  const onPressOut = useCallback(() => {
    handlePressOut();
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim, handlePressOut]);

  return (
    <AnimatedPressable
      style={[
        styles.button,
        variant === 'primary' && { backgroundColor: palette.accentPrimary },
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
        variant === 'danger' && [
          styles.dangerButton,
          {
            backgroundColor: dangerBg,
            borderColor: dangerBorder,
          },
        ],
        disabled && styles.disabledButton,
        full && styles.fullWidth,
        showPressGlow && isTapActive && !disabled && !loading && {
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0.18,
          shadowRadius: 10,
          elevation: 5,
        },
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={testID}
      android_ripple={{
        color: isPrimaryLike
          ? 'rgba(255,255,255,0.18)'
          : isDanger
            ? withAlpha(dangerTone, 0.18)
            : palette.inputBg,
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
          {displayTitle}
        </Text>
      )}
    </AnimatedPressable>
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
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  mutedButton: {
    backgroundColor: 'transparent',
  },
  dangerButton: {
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0,
    textAlign: 'center',
  },
});
