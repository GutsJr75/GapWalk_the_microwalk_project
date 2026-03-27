import React from 'react';
import { Platform, Pressable, StyleSheet, ActivityIndicator, View, ViewStyle, TextStyle, StyleProp, Animated } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { Text } from './Text';
import { useButtonPressMotion } from '../hooks/useButtonPressMotion';
import { toDisplayTitleCase } from '../utils/textCase';
import {
  buttonSizeTokens,
  getButtonContainerSizeStyle,
  getButtonTextSizeStyle,
  getButtonVisualState,
  type ButtonSize,
  type ButtonVariant,
} from './buttonSystem';
import { PressGlowOverlay } from './PressGlowOverlay';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
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
  size = 'default',
  disabled = false,
  loading = false,
  style,
  textStyle,
  full = false,
  testID,
}) => {
  const palette = useThemePalette();
  const visualState = React.useMemo(() => getButtonVisualState(variant, palette), [palette, variant]);
  const displayTitle = React.useMemo(() => toDisplayTitleCase(title), [title]);
  const {
    animatedTransformStyle,
    scaleAnim,
    pressScale,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = useButtonPressMotion({
    onPress,
    enabled: !(disabled || loading),
    size,
  });

  return (
    <AnimatedPressable
      style={[
        styles.button,
        getButtonContainerSizeStyle(size),
        visualState.containerStyle,
        disabled && styles.disabledButton,
        full && size !== 'icon' && styles.fullWidth,
        animatedTransformStyle,
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
        color: visualState.rippleColor,
      }}
    >
      <PressGlowOverlay
        scaleAnim={scaleAnim}
        pressScale={pressScale}
        glowColor={disabled || loading ? null : visualState.glowColor}
        glowOpacity={visualState.glowOpacity}
        borderRadius={buttonSizeTokens[size].borderRadius}
      />
      {loading ? (
        <ActivityIndicator color={visualState.spinnerColor} />
      ) : variant === 'muted' ? (
        <View style={styles.mutedTextPill}>
          <PressGlowOverlay
            scaleAnim={scaleAnim}
            pressScale={pressScale}
            glowColor={disabled ? null : palette.accentPrimary}
            glowOpacity={Platform.OS === 'ios' ? 0.14 : 0.10}
            borderRadius={theme.borderRadius.sm}
          />
          <Text
            variant="body"
            style={[
              styles.buttonText,
              getButtonTextSizeStyle(size),
              { color: visualState.labelColor },
              textStyle,
            ]}
          >
            {displayTitle}
          </Text>
        </View>
      ) : (
        <Text
          variant="body"
          style={[
            styles.buttonText,
            getButtonTextSizeStyle(size),
            { color: visualState.labelColor },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabledButton: {
    opacity: 0.55,
  },
  mutedTextPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  buttonText: {
    letterSpacing: 0,
    textAlign: 'center',
    flexShrink: 1,
  },
});
