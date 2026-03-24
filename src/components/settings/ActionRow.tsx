import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../Text";
import { theme } from "../../theme";
import { getThemePalette } from "../../theme/palette";
import { motion } from "../../theme/motion";
import { usePressMotion } from "../../hooks/usePressMotion";
import { AnimatedPressable } from "./settingsAnimated";
import { settingsStyles } from "./settingsStyles";

export const ActionRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress?: () => void;
  rightText?: string;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  palette: ReturnType<typeof getThemePalette>;
}> = ({
  icon,
  title,
  description,
  onPress,
  rightText,
  destructive = false,
  disabled = false,
  busy = false,
  testID,
  palette,
}) => {
  const {
    animatedTransformStyle,
    isPressActive,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = usePressMotion({
    onPress: onPress ?? (() => {}),
    enabled: !!onPress && !(disabled || busy),
    hapticIntent: destructive ? "destructive" : "selection",
    pressScale: motion.scale.pressSubtle,
  });
  const content = (
    <View
      style={[settingsStyles.actionRow, disabled && settingsStyles.actionRowDisabled]}
    >
      <View style={settingsStyles.settingIconBox}>
        <Ionicons
          name={icon}
          size={16}
          color={destructive ? theme.colors.danger : theme.colors.accentPrimary}
        />
      </View>
      <View style={settingsStyles.actionTextWrap}>
        <Text
          variant="body"
          style={[
            settingsStyles.actionTitle,
            {
              color: destructive ? theme.colors.danger : palette.textPrimary,
            },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text
            variant="bodySmall"
            style={[
              settingsStyles.actionDescription,
              { color: palette.textMuted },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <View style={settingsStyles.actionTrailing}>
        {busy ? (
          <ActivityIndicator size="small" color={palette.accentPrimary} />
        ) : rightText ? (
          <Text
            variant="bodySmall"
            style={[
              settingsStyles.actionRightText,
              { color: palette.textMuted },
            ]}
          >
            {rightText}
          </Text>
        ) : (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={palette.textMuted}
          />
        )}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || busy}
      testID={testID}
      style={[
        animatedTransformStyle,
        isPressActive && !disabled && !busy && settingsStyles.actionRowPressed,
      ]}
    >
      {content}
    </AnimatedPressable>
  );
};
