import React from 'react';
import { Pressable, StyleSheet, StyleProp, ViewStyle, Animated } from 'react-native';
import { AppIcon, type AppIconName } from './AppIcon';
import { useThemePalette } from '../theme/palette';
import { useButtonPressMotion } from '../hooks/useButtonPressMotion';
import {
  buttonSizeTokens,
  getButtonContainerSizeStyle,
  getButtonVisualState,
  type ButtonSize,
  type ButtonVariant,
} from './buttonSystem';
import { PressGlowOverlay } from './PressGlowOverlay';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface IconButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  iconName?: AppIconName;
  renderIcon?: (color: string) => React.ReactNode;
  iconSize?: number;
  iconStrokeWidth?: number;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  testID?: string;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: React.FC<IconButtonProps> = ({
  onPress,
  accessibilityLabel,
  iconName,
  renderIcon,
  iconSize = 18,
  iconStrokeWidth = 1.9,
  variant = 'secondary',
  size = 'icon',
  disabled = false,
  testID,
  hitSlop = 6,
  style,
}) => {
  const palette = useThemePalette();
  const visualState = React.useMemo(() => getButtonVisualState(variant, palette), [palette, variant]);
  const { animatedTransformStyle, scaleAnim, pressScale, handlePress, handlePressIn, handlePressOut } = useButtonPressMotion({
    onPress,
    enabled: !disabled,
    size,
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      android_ripple={{ color: visualState.rippleColor }}
      style={[
        styles.button,
        getButtonContainerSizeStyle(size),
        visualState.containerStyle,
        disabled && styles.disabled,
        animatedTransformStyle,
        style,
      ]}
    >
      <PressGlowOverlay
        scaleAnim={scaleAnim}
        pressScale={pressScale}
        glowColor={disabled ? null : visualState.glowColor}
        glowOpacity={visualState.glowOpacity}
        borderRadius={buttonSizeTokens[size].borderRadius}
      />
      {renderIcon
        ? renderIcon(visualState.iconColor)
        : iconName
          ? <AppIcon name={iconName} size={iconSize} color={visualState.iconColor} strokeWidth={iconStrokeWidth} />
          : null}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.55,
  },
});
