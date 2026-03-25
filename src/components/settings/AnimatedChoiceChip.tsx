import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { getThemePalette } from "../../theme/palette";
import { getMotionDuration, motion } from "../../theme/motion";
import { usePressMotion } from "../../hooks/usePressMotion";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { AnimatedPressable } from "./settingsAnimated";
import { settingsStyles } from "./settingsStyles";
import type { ThemeMode } from "./types";

export const AnimatedChoiceChip: React.FC<{
  selected: boolean;
  label: string;
  onPress: () => void;
  testID: string;
  themeMode: ThemeMode;
  fullWidth?: boolean;
}> = ({ selected, label, onPress, testID, themeMode, fullWidth = false }) => {
  const palette = getThemePalette(themeMode);
  const { reduceMotion } = useReducedMotionPreference();
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const { animatedTransformStyle, handlePress, handlePressIn, handlePressOut } =
    usePressMotion({
      onPress,
      hapticIntent: "selection",
      pressScale: motion.scale.pressSubtle,
    });

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: getMotionDuration(reduceMotion, 210, motion.duration.fast),
      easing: motion.easing.entrance,
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion, selected]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.bgSurface, palette.accentPrimary],
  });
  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.borderStrong, palette.accentPrimary],
  });
  const textColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.textPrimary, palette.accentOnSolid],
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        settingsStyles.choicePressable,
        fullWidth && settingsStyles.choicePressableFull,
        animatedTransformStyle,
      ]}
    >
      <Animated.View
        style={[
          settingsStyles.choiceChip,
          fullWidth && settingsStyles.choiceChipFull,
          {
            backgroundColor,
            borderColor,
          },
        ]}
      >
        <Animated.Text
          style={[settingsStyles.choiceChipLabel, { color: textColor }]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </AnimatedPressable>
  );
};
