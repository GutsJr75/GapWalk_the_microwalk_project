import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { getThemePalette } from "../../theme/palette";
import { motion } from "../../theme/motion";
import { usePressMotion } from "../../hooks/usePressMotion";
import { AnimatedPressable } from "./settingsAnimated";
import { settingsStyles } from "./settingsStyles";
import type { ThemeMode } from "./types";

export const AnimatedToggle: React.FC<{
  value: boolean;
  onValueChange: () => void;
  disabled?: boolean;
  testID: string;
  themeMode: ThemeMode;
}> = ({ value, onValueChange, disabled = false, testID, themeMode }) => {
  const palette = getThemePalette(themeMode);
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const { animatedTransformStyle, handlePress, handlePressIn, handlePressOut } =
    usePressMotion({
      onPress: onValueChange,
      enabled: !disabled,
      hapticIntent: "selection",
      pressScale: motion.scale.pressSubtle,
    });

  useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      ...motion.spring.settle,
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const trackBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.borderStrong, palette.accentPrimary],
  });
  const trackBorder = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.borderStrong, palette.accentPrimary],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 23],
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[
        animatedTransformStyle,
        disabled && settingsStyles.toggleDisabledPressable,
      ]}
    >
      <Animated.View
        style={[
          settingsStyles.toggleTrack,
          {
            backgroundColor: trackBackground,
            borderColor: trackBorder,
          },
          disabled && settingsStyles.toggleDisabled,
        ]}
      >
        <Animated.View
          style={[
            settingsStyles.toggleThumb,
            {
              backgroundColor: value
                ? palette.accentOnSolid
                : palette.bgSurface,
              transform: [{ translateX: thumbTranslate }],
            },
          ]}
        />
      </Animated.View>
    </AnimatedPressable>
  );
};
