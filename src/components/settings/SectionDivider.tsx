import React from "react";
import { View } from "react-native";
import { settingsStyles } from "./settingsStyles";

export const SectionDivider: React.FC<{ color: string }> = ({ color }) => (
  <View style={[settingsStyles.divider, { backgroundColor: color }]} />
);
