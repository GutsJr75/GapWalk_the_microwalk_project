import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../Text";
import { InfoTipButton } from "../InfoTooltip";
import { theme } from "../../theme";
import { settingsStyles } from "./settingsStyles";
import type { SettingShellProps } from "./types";

export const SettingShell: React.FC<SettingShellProps> = ({
  icon,
  title,
  description,
  infoText,
  infoId,
  activeInfoId,
  onInfoToggle,
  children,
}) => (
  <View style={settingsStyles.settingShell}>
    <View style={settingsStyles.settingShellRow}>
      <View style={settingsStyles.settingIconBox}>
        <Ionicons name={icon} size={16} color={theme.colors.accentPrimary} />
      </View>
      <View style={settingsStyles.settingContent}>
        <View style={settingsStyles.settingTitleLine}>
          <Text variant="body" style={settingsStyles.settingTitle}>
            {title}
          </Text>
          {infoText && infoId ? (
            <InfoTipButton
              id={infoId}
              text={infoText}
              activeInfoId={activeInfoId}
              onToggle={onInfoToggle}
              testID={`settings-info-${infoId}`}
            />
          ) : null}
        </View>
        {description ? (
          <Text variant="bodySmall" style={settingsStyles.settingDescription}>
            {description}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  </View>
);
