import type { ReactNode } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { ActiveInfoState } from "../InfoTooltip";

export type ThemeMode = "dark" | "light";

export interface ChoiceOption {
  label: string;
  value: string;
  testID: string;
}

export interface SettingShellProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  infoText?: string;
  infoId?: string;
  activeInfoId: string | null;
  onInfoToggle: (next: ActiveInfoState) => void;
  children?: ReactNode;
}
