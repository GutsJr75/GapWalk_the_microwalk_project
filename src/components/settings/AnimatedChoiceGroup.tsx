import React from "react";
import { View } from "react-native";
import { AnimatedChoiceChip } from "./AnimatedChoiceChip";
import { settingsStyles } from "./settingsStyles";
import type { ChoiceOption, ThemeMode } from "./types";

export const AnimatedChoiceGroup: React.FC<{
  value: string;
  onChange: (next: string) => void;
  options: ChoiceOption[];
  themeMode: ThemeMode;
  orientation?: "horizontal" | "vertical";
}> = ({ value, onChange, options, themeMode, orientation = "horizontal" }) => {
  const stacked = orientation === "vertical";

  return (
    <View
      style={[
        settingsStyles.choiceGroup,
        stacked && settingsStyles.choiceGroupVertical,
      ]}
    >
      {options.map((option) => (
        <AnimatedChoiceChip
          key={option.value}
          selected={option.value === value}
          label={option.label}
          onPress={() => onChange(option.value)}
          testID={option.testID}
          themeMode={themeMode}
          fullWidth={stacked}
        />
      ))}
    </View>
  );
};
