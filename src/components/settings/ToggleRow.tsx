import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../Text";
import { getThemePalette } from "../../theme/palette";
import { withAlpha } from "../../theme/colorUtils";
import { AnimatedToggle } from "./AnimatedToggle";
import { settingsStyles } from "./settingsStyles";
import type { ThemeMode } from "./types";

export const ToggleRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testID: string;
  themeMode: ThemeMode;
  palette: ReturnType<typeof getThemePalette>;
  statusLabel?: string;
}> = ({
  icon,
  title,
  value,
  onToggle,
  disabled = false,
  testID,
  themeMode,
  palette,
  statusLabel,
}) => (
  <View style={settingsStyles.toggleRow}>
    <View style={settingsStyles.toggleTextWrap}>
      <View style={settingsStyles.toggleTitleLine}>
        <Ionicons
          name={icon}
          size={14}
          color={disabled ? palette.textMuted : palette.accentPrimary}
        />
        <Text
          variant="body"
          style={[
            settingsStyles.toggleTitle,
            { color: disabled ? palette.textMuted : palette.textPrimary },
          ]}
        >
          {title}
        </Text>
      </View>
    </View>
    <View style={settingsStyles.toggleTrailing}>
      {statusLabel ? (
        <View
          style={[
            settingsStyles.lockedBadge,
            {
              backgroundColor: withAlpha(palette.accentPrimary, 0.12),
              borderColor: palette.accentBorder,
            },
          ]}
        >
          <Text
            variant="bodySmall"
            style={[
              settingsStyles.lockedBadgeText,
              { color: palette.accentPrimary },
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      ) : null}
      <AnimatedToggle
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        testID={testID}
        themeMode={themeMode}
      />
    </View>
  </View>
);
