import React, { type ReactNode } from "react";
import { View } from "react-native";
import { Card } from "../Card";
import { Text } from "../Text";
import { getThemePalette } from "../../theme/palette";
import { settingsStyles } from "./settingsStyles";

export const SettingsSection: React.FC<{
  title: string;
  children: ReactNode;
  palette: ReturnType<typeof getThemePalette>;
}> = ({ title, children, palette }) => (
  <View style={settingsStyles.sectionBlock}>
    <Text
      variant="bodySmall"
      style={[settingsStyles.sectionLabel, { color: palette.textMuted }]}
    >
      {title}
    </Text>
    <Card elevated style={settingsStyles.sectionCard}>
      {children}
    </Card>
  </View>
);
