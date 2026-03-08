import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { RootStackParamList } from "../../App";
import { Container } from "../components/Container";
import { Text } from "../components/Text";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Modal as AppModal } from "../components/Modal";
import { ScreenHeader } from "../components/ScreenHeader";
import { SuccessToast } from "../components/SuccessToast";
import { TwoActionBar } from "../components/TwoActionBar";
import {
  ActiveInfoState,
  InfoTipButton,
  InfoTooltipOverlay,
} from "../components/InfoTooltip";
import { appFontFamily, theme } from "../theme";
import {
  createLayoutMotionConfig,
  motion,
  getMotionDuration,
} from "../theme/motion";
import { withAlpha } from "../theme/colorUtils";
import { screenChrome } from "../theme/screenChrome";
import { getThemePalette } from "../theme/palette";
import { useAppStore } from "../store";
import {
  WalkDisplayCard,
  ALL_WALK_DISPLAY_CARDS,
  WALK_DISPLAY_CARD_LABELS,
  NotificationTimerMode,
  NOTIFICATION_TIMER_MODE_LABELS,
} from "../types";
import { translateLiteral } from "../i18n";
import { plansRepo } from "../data/repositories/plansRepo";
import { notificationPlanActions } from "../services/notificationPlanActions";
import { analyticsRepo } from "../data/repositories/analyticsRepo";
import { sessionsRepo } from "../data/repositories/sessionsRepo";
import { getDatabase } from "../data/db";
import { authStorage } from "../data/authStorage";
import { androidWalkTracking } from "../services/androidWalkTracking";
import { notificationService } from "../services/notifications";
import { toUserFriendlyError } from "../utils/errorMessages";
import { usePressMotion } from "../hooks/usePressMotion";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;
type ThemeMode = "dark" | "light";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PRIVACY_POLICY_URL = "https://gapwalk.com/privacy";
const TERMS_URL = "https://gapwalk.com/terms";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const isFabric = !!(globalThis as { nativeFabricUIManager?: unknown })
  .nativeFabricUIManager;

if (
  Platform.OS === "android" &&
  !isFabric &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getWebConfirm = (): ((message: string) => boolean) | null => {
  const confirm = (
    globalThis as typeof globalThis & { confirm?: (message: string) => boolean }
  ).confirm;
  return typeof confirm === "function" ? confirm : null;
};

interface ChoiceOption {
  label: string;
  value: string;
  testID: string;
}

interface SettingShellProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  infoText?: string;
  infoId?: string;
  activeInfoId: string | null;
  onInfoToggle: (next: ActiveInfoState) => void;
  children?: React.ReactNode;
}

const AnimatedChoiceChip: React.FC<{
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
        styles.choicePressable,
        fullWidth && styles.choicePressableFull,
        animatedTransformStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.choiceChip,
          fullWidth && styles.choiceChipFull,
          {
            backgroundColor,
            borderColor,
          },
        ]}
      >
        <Animated.Text style={[styles.choiceChipLabel, { color: textColor }]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </AnimatedPressable>
  );
};

const AnimatedChoiceGroup: React.FC<{
  value: string;
  onChange: (next: string) => void;
  options: ChoiceOption[];
  themeMode: ThemeMode;
  orientation?: "horizontal" | "vertical";
}> = ({ value, onChange, options, themeMode, orientation = "horizontal" }) => {
  const stacked = orientation === "vertical";

  return (
    <View style={[styles.choiceGroup, stacked && styles.choiceGroupVertical]}>
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

const AnimatedToggle: React.FC<{
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
        disabled && styles.toggleDisabledPressable,
      ]}
    >
      <Animated.View
        style={[
          styles.toggleTrack,
          {
            backgroundColor: trackBackground,
            borderColor: trackBorder,
          },
          disabled && styles.toggleDisabled,
        ]}
      >
        <Animated.View
          style={[
            styles.toggleThumb,
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

const SettingsSection: React.FC<{
  title: string;
  children: React.ReactNode;
  palette: ReturnType<typeof getThemePalette>;
}> = ({ title, children, palette }) => (
  <View style={styles.sectionBlock}>
    <Text
      variant="bodySmall"
      style={[styles.sectionLabel, { color: palette.textMuted }]}
    >
      {title}
    </Text>
    <Card elevated style={styles.sectionCard}>
      {children}
    </Card>
  </View>
);

const SectionDivider: React.FC<{ color: string }> = ({ color }) => (
  <View style={[styles.divider, { backgroundColor: color }]} />
);

const SettingShell: React.FC<SettingShellProps> = ({
  icon,
  title,
  description,
  infoText,
  infoId,
  activeInfoId,
  onInfoToggle,
  children,
}) => (
  <View style={styles.settingShell}>
    <View style={styles.settingShellRow}>
      <View style={styles.settingIconBox}>
        <Ionicons name={icon} size={16} color={theme.colors.accentPrimary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTitleLine}>
          <Text variant="body" style={styles.settingTitle}>
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
          <Text variant="bodySmall" style={styles.settingDescription}>
            {description}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  </View>
);

const ToggleRow: React.FC<{
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
  <View style={styles.toggleRow}>
    <View style={styles.toggleTextWrap}>
      <View style={styles.toggleTitleLine}>
        <Ionicons
          name={icon}
          size={14}
          color={disabled ? palette.textMuted : palette.accentPrimary}
        />
        <Text
          variant="body"
          style={[
            styles.toggleTitle,
            { color: disabled ? palette.textMuted : palette.textPrimary },
          ]}
        >
          {title}
        </Text>
      </View>
    </View>
    <View style={styles.toggleTrailing}>
      {statusLabel ? (
        <View
          style={[
            styles.lockedBadge,
            {
              backgroundColor: withAlpha(palette.accentPrimary, 0.12),
              borderColor: palette.accentBorder,
            },
          ]}
        >
          <Text
            variant="bodySmall"
            style={[styles.lockedBadgeText, { color: palette.accentPrimary }]}
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

const ActionRow: React.FC<{
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
    <View style={[styles.actionRow, disabled && styles.actionRowDisabled]}>
      <View style={styles.settingIconBox}>
        <Ionicons
          name={icon}
          size={16}
          color={destructive ? theme.colors.danger : theme.colors.accentPrimary}
        />
      </View>
      <View style={styles.actionTextWrap}>
        <Text
          variant="body"
          style={[
            styles.actionTitle,
            { color: destructive ? theme.colors.danger : palette.textPrimary },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text
            variant="bodySmall"
            style={[styles.actionDescription, { color: palette.textMuted }]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.actionTrailing}>
        {busy ? (
          <ActivityIndicator size="small" color={palette.accentPrimary} />
        ) : rightText ? (
          <Text
            variant="bodySmall"
            style={[styles.actionRightText, { color: palette.textMuted }]}
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
        isPressActive && !disabled && !busy && styles.actionRowPressed,
      ]}
    >
      {content}
    </AnimatedPressable>
  );
};

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode,
    setThemeMode,
    language,
    setLanguage,
    distanceUnit,
    setDistanceUnit,
    firstDayOfWeek,
    setFirstDayOfWeek,
    vibrationEnabled,
    setVibrationEnabled,
    notificationTimerMode,
    setNotificationTimerMode,
    walkDisplayCards,
    setWalkDisplayCards,
  } = useAppStore();
  const { reduceMotion } = useReducedMotionPreference();
  const palette = getThemePalette(themeMode);

  const baselineThemeModeRef = useRef(themeMode);
  const baselineLanguageRef = useRef(language);
  const baselineDistanceUnitRef = useRef(distanceUnit);
  const baselineFirstDayRef = useRef(firstDayOfWeek);
  const baselineVibrationRef = useRef(vibrationEnabled);
  const baselineNotificationTimerModeRef = useRef(notificationTimerMode);
  const baselineWalkDisplayCardsRef = useRef(walkDisplayCards);

  const themeModeRef = useRef(themeMode);
  const languageRef = useRef(language);
  const distanceUnitRef = useRef(distanceUnit);
  const firstDayRef = useRef(firstDayOfWeek);
  const vibrationRef = useRef(vibrationEnabled);
  const notificationTimerModeRef = useRef(notificationTimerMode);
  const walkDisplayCardsRef = useRef(walkDisplayCards);

  const allowExitRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const saveBarAnim = useRef(new Animated.Value(0)).current;

  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState("Settings saved");
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfoState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
  } | null>(null);

  const isE2E = process.env.EXPO_PUBLIC_E2E === "1";

  const t = useCallback(
    (key: string) => translateLiteral(key, language),
    [language],
  );

  useEffect(() => {
    themeModeRef.current = themeMode;
  }, [themeMode]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    distanceUnitRef.current = distanceUnit;
  }, [distanceUnit]);
  useEffect(() => {
    firstDayRef.current = firstDayOfWeek;
  }, [firstDayOfWeek]);
  useEffect(() => {
    vibrationRef.current = vibrationEnabled;
  }, [vibrationEnabled]);
  useEffect(() => {
    notificationTimerModeRef.current = notificationTimerMode;
  }, [notificationTimerMode]);
  useEffect(() => {
    walkDisplayCardsRef.current = walkDisplayCards;
  }, [walkDisplayCards]);

  const syncBaselineToCurrent = useCallback(() => {
    baselineThemeModeRef.current = themeModeRef.current;
    baselineLanguageRef.current = languageRef.current;
    baselineDistanceUnitRef.current = distanceUnitRef.current;
    baselineFirstDayRef.current = firstDayRef.current;
    baselineVibrationRef.current = vibrationRef.current;
    baselineNotificationTimerModeRef.current = notificationTimerModeRef.current;
    baselineWalkDisplayCardsRef.current = walkDisplayCardsRef.current;
    hasUnsavedChangesRef.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      syncBaselineToCurrent();
      allowExitRef.current = false;
      return () => {};
    }, [syncBaselineToCurrent]),
  );

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setActiveInfo(null);
    });
    return unsubscribeBlur;
  }, [navigation]);

  const hasUnsavedChanges =
    themeMode !== baselineThemeModeRef.current ||
    language !== baselineLanguageRef.current ||
    distanceUnit !== baselineDistanceUnitRef.current ||
    firstDayOfWeek !== baselineFirstDayRef.current ||
    vibrationEnabled !== baselineVibrationRef.current ||
    notificationTimerMode !== baselineNotificationTimerModeRef.current ||
    JSON.stringify(walkDisplayCards) !==
      JSON.stringify(baselineWalkDisplayCardsRef.current);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
    Animated.spring(saveBarAnim, {
      toValue: hasUnsavedChanges ? 1 : 0,
      tension: 110,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [hasUnsavedChanges, saveBarAnim]);

  const closeInfoOverlay = useCallback(() => {
    setActiveInfo(null);
  }, []);

  const handleInfoToggle = useCallback((next: ActiveInfoState) => {
    setActiveInfo((prev) => (prev?.id === next.id ? null : next));
  }, []);

  const animateSettingChange = useCallback(() => {
    LayoutAnimation.configureNext(createLayoutMotionConfig(reduceMotion));
    closeInfoOverlay();
  }, [closeInfoOverlay, reduceMotion]);

  const restoreBaselineSettings = useCallback(() => {
    const baselineThemeMode = baselineThemeModeRef.current;
    const baselineLanguage = baselineLanguageRef.current;
    const baselineDistanceUnit = baselineDistanceUnitRef.current;
    const baselineFirstDay = baselineFirstDayRef.current;
    const baselineVibrationEnabled = baselineVibrationRef.current;
    const baselineNotificationTimerMode =
      baselineNotificationTimerModeRef.current;
    const baselineWalkDisplayCards = baselineWalkDisplayCardsRef.current;

    animateSettingChange();
    setThemeMode(baselineThemeMode);
    setLanguage(baselineLanguage);
    setDistanceUnit(baselineDistanceUnit);
    setFirstDayOfWeek(baselineFirstDay);
    setVibrationEnabled(baselineVibrationEnabled);
    setNotificationTimerMode(baselineNotificationTimerMode);
    setWalkDisplayCards(baselineWalkDisplayCards);

    themeModeRef.current = baselineThemeMode;
    languageRef.current = baselineLanguage;
    distanceUnitRef.current = baselineDistanceUnit;
    firstDayRef.current = baselineFirstDay;
    vibrationRef.current = baselineVibrationEnabled;
    notificationTimerModeRef.current = baselineNotificationTimerMode;
    walkDisplayCardsRef.current = baselineWalkDisplayCards;
    hasUnsavedChangesRef.current = false;
  }, [
    animateSettingChange,
    setDistanceUnit,
    setFirstDayOfWeek,
    setLanguage,
    setNotificationTimerMode,
    setThemeMode,
    setVibrationEnabled,
    setWalkDisplayCards,
  ]);

  const handleBack = useCallback(() => {
    closeInfoOverlay();
    navigation.navigate("Dashboard", { openMenu: true });
  }, [closeInfoOverlay, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (allowExitRef.current || !hasUnsavedChangesRef.current) return;
      event.preventDefault();

      const activeLanguage = languageRef.current;
      const title = translateLiteral("Discard changes?", activeLanguage);
      const message = translateLiteral(
        "Your unsaved settings changes will be lost. Do you want to go back?",
        activeLanguage,
      );

      const discardAndLeave = () => {
        restoreBaselineSettings();
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      };

      const webConfirm = getWebConfirm();
      if (Platform.OS === "web" && webConfirm) {
        const ok = webConfirm(`${title}\n\n${message}`);
        if (ok) discardAndLeave();
        return;
      }

      Alert.alert(title, message, [
        {
          text: translateLiteral("Keep editing", activeLanguage),
          style: "cancel",
        },
        {
          text: translateLiteral("Discard", activeLanguage),
          style: "destructive",
          onPress: discardAndLeave,
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, restoreBaselineSettings]);

  const startReplayTour = useCallback(() => {
    closeInfoOverlay();
    allowExitRef.current = true;
    navigation.navigate("Dashboard", { startTour: true });
  }, [closeInfoOverlay, navigation]);

  const handleReplayTour = useCallback(() => {
    if (!hasUnsavedChangesRef.current) {
      startReplayTour();
      return;
    }

    const activeLanguage = languageRef.current;
    const title = translateLiteral(
      "Discard changes and replay tour?",
      activeLanguage,
    );
    const message = translateLiteral(
      "Your unsaved settings changes will be lost. Do you want to replay the tour?",
      activeLanguage,
    );
    const discardAndReplay = () => {
      restoreBaselineSettings();
      startReplayTour();
    };

    const webConfirm = getWebConfirm();
    if (Platform.OS === "web" && webConfirm) {
      const ok = webConfirm(`${title}\n\n${message}`);
      if (ok) discardAndReplay();
      return;
    }

    Alert.alert(title, message, [
      {
        text: translateLiteral("Keep editing", activeLanguage),
        style: "cancel",
      },
      {
        text: translateLiteral("Discard", activeLanguage),
        style: "destructive",
        onPress: discardAndReplay,
      },
    ]);
  }, [restoreBaselineSettings, startReplayTour]);

  const persistSettings = useCallback(async () => {
    setSaving(true);
    closeInfoOverlay();

    try {
      await authStorage.saveThemeMode(themeModeRef.current);
      await authStorage.saveLanguage(languageRef.current);
      await authStorage.saveDistanceUnit(distanceUnitRef.current);
      await authStorage.saveFirstDayOfWeek(firstDayRef.current);
      await authStorage.saveVibrationEnabled(vibrationRef.current);
      await authStorage.saveNotificationTimerMode(
        notificationTimerModeRef.current,
      );
      await authStorage.saveWalkDisplayCards(walkDisplayCardsRef.current);

      await notificationService.setReminderVibrationEnabled(
        vibrationRef.current,
      );

      if (androidWalkTracking.isSupported()) {
        await androidWalkTracking.updateNotificationTimerMode(
          notificationTimerModeRef.current,
        );
      }

      syncBaselineToCurrent();
      setSaveToastMessage(t("Settings saved"));
      setShowSaveToast(true);
    } catch (error) {
      Alert.alert("Could not save settings", toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  }, [closeInfoOverlay, syncBaselineToCurrent, t]);

  const handleSavePress = useCallback(() => {
    if (!hasUnsavedChanges || saving) return;
    closeInfoOverlay();

    const title = "Save settings?";
    const message =
      "These changes will update how GapWalk looks and behaves. Do you want to save them now?";
    const confirmSave = () => {
      void persistSettings();
    };

    const webConfirm = getWebConfirm();
    if (Platform.OS === "web" && webConfirm) {
      const ok = webConfirm(`${title}\n\n${message}`);
      if (ok) confirmSave();
      return;
    }

    setConfirmDialog({
      title,
      message,
      confirmText: t("Save"),
      onConfirm: confirmSave,
    });
  }, [closeInfoOverlay, hasUnsavedChanges, persistSettings, saving, t]);

  const handleExportWalkHistory = useCallback(async () => {
    if (exporting) return;
    closeInfoOverlay();
    setExporting(true);
    try {
      const sessions = await sessionsRepo.getAll();
      if (sessions.length === 0) {
        Alert.alert("No Data", "There are no walk sessions to export yet.");
        return;
      }

      const header =
        "Date,Start Time,End Time,Duration (min),Steps,Distance (m),Calories";
      const rows = sessions.map((session) => {
        const startDate = format(new Date(session.start), "yyyy-MM-dd");
        const startTime = format(new Date(session.start), "HH:mm");
        const endTime = format(new Date(session.end), "HH:mm");
        const durationMin = Math.round(session.activeSeconds / 60);
        const steps = session.steps ?? 0;
        const distance =
          session.distanceMeters != null
            ? Math.round(session.distanceMeters)
            : "";
        const calories =
          session.calories != null ? Math.round(session.calories) : "";
        return `${startDate},${startTime},${endTime},${durationMin},${steps},${distance},${calories}`;
      });

      const filename = `gapwalk-walks-${format(new Date(), "yyyy-MM-dd")}.csv`;
      const file = new File(Paths.cache, filename);
      await file.write([header, ...rows].join("\n"));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Walk History",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing not available",
          "Your device does not support file sharing.",
        );
      }
    } catch (error) {
      Alert.alert("Export failed", toUserFriendlyError(error));
    } finally {
      setExporting(false);
    }
  }, [closeInfoOverlay, exporting]);

  const handleClearWalkHistory = useCallback(() => {
    closeInfoOverlay();
    Alert.alert(
      "Clear Walk History",
      "This will permanently delete all your walk sessions, routes, and related data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await getDatabase();
              await db.runAsync("DELETE FROM walk_sessions");
              await db.runAsync("DELETE FROM walk_routes");
              await db.runAsync("DELETE FROM walk_pause_events");
              await db.runAsync("DELETE FROM walk_checkpoint");
              setSaveToastMessage(t("Walk history cleared"));
              setShowSaveToast(true);
            } catch (error) {
              Alert.alert("Error", toUserFriendlyError(error));
            }
          },
        },
      ],
    );
  }, [closeInfoOverlay, t]);

  const handleClearCache = useCallback(() => {
    closeInfoOverlay();
    Alert.alert(
      "Clear Cache",
      "This clears temporary analytics and cached app data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await getDatabase();
              await db.runAsync("DELETE FROM analytics_events");
              await db.runAsync("DELETE FROM crash_reports");
              setSaveToastMessage(t("Cache cleared"));
              setShowSaveToast(true);
            } catch (error) {
              Alert.alert("Error", toUserFriendlyError(error));
            }
          },
        },
      ],
    );
  }, [closeInfoOverlay, t]);

  const handleOpenPolicy = useCallback(
    (url: string) => {
      closeInfoOverlay();
      void WebBrowser.openBrowserAsync(url);
    },
    [closeInfoOverlay],
  );

  const handleRateGapWalk = useCallback(() => {
    closeInfoOverlay();
    const storeUrl =
      Platform.OS === "ios"
        ? "https://apps.apple.com/app/gapwalk/id0000000000"
        : "https://play.google.com/store/apps/details?id=com.gapwalk.app";
    Linking.openURL(storeUrl).catch(() => {});
  }, [closeInfoOverlay]);

  const simulateNotificationStart = useCallback(async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      Alert.alert(
        "No upcoming plan",
        "Create a schedule first so we can simulate the start action.",
      );
      return;
    }
    const result = await notificationPlanActions.canStartPlan(first.id);
    if (!result.allowed) {
      Alert.alert(
        "Action blocked",
        "The start action was blocked, likely because today's goal is already complete.",
      );
      return;
    }
    navigation.navigate("Walking", {
      planId: first.id,
      startedFromNotification: true,
    });
  }, [navigation]);

  const simulateNotificationSkip = useCallback(async () => {
    const first = (await plansRepo.getUpcomingPlans(1))[0];
    if (!first) {
      Alert.alert(
        "No upcoming plan",
        "Create a schedule first so we can simulate the skip action.",
      );
      return;
    }
    await notificationPlanActions.skipGap(first.id);
    Alert.alert("Done", "Skip action simulated for the next upcoming plan.");
  }, []);

  const showTelemetrySnapshot = useCallback(async () => {
    const events = await analyticsRepo.getRecentEvents(20);
    const crashes = await analyticsRepo.getRecentCrashes(5);
    Alert.alert(
      "Telemetry Snapshot",
      `Recent events: ${events.length}\nRecent crashes: ${crashes.length}`,
    );
  }, []);

  const handleToggleWalkCard = useCallback(
    (card: WalkDisplayCard) => {
      animateSettingChange();
      if (card === "walkDuration") return;

      const isOn = walkDisplayCards.includes(card);
      if (isOn) {
        if (walkDisplayCards.length <= 2) {
          Alert.alert(
            "Minimum Cards",
            "At least 2 cards must stay visible on the walking screen.",
          );
          return;
        }
        setWalkDisplayCards(
          walkDisplayCards.filter((currentCard) => currentCard !== card),
        );
        return;
      }

      const ordered = ALL_WALK_DISPLAY_CARDS.filter(
        (currentCard) =>
          walkDisplayCards.includes(currentCard) || currentCard === card,
      );
      setWalkDisplayCards(ordered);
    },
    [animateSettingChange, setWalkDisplayCards, walkDisplayCards],
  );

  const setThemeModeWithAnimation = useCallback(
    (nextThemeMode: ThemeMode) => {
      if (nextThemeMode === themeMode) return;
      animateSettingChange();
      setThemeMode(nextThemeMode);
    },
    [animateSettingChange, setThemeMode, themeMode],
  );

  const setLanguageWithAnimation = useCallback(
    (nextLanguage: "en" | "es") => {
      if (nextLanguage === language) return;
      animateSettingChange();
      setLanguage(nextLanguage);
    },
    [animateSettingChange, language, setLanguage],
  );

  const setDistanceUnitWithAnimation = useCallback(
    (nextDistanceUnit: "km" | "mi") => {
      if (nextDistanceUnit === distanceUnit) return;
      animateSettingChange();
      setDistanceUnit(nextDistanceUnit);
    },
    [animateSettingChange, distanceUnit, setDistanceUnit],
  );

  const setFirstDayWithAnimation = useCallback(
    (nextFirstDay: "sun" | "mon") => {
      if (nextFirstDay === firstDayOfWeek) return;
      animateSettingChange();
      setFirstDayOfWeek(nextFirstDay);
    },
    [animateSettingChange, firstDayOfWeek, setFirstDayOfWeek],
  );

  const setVibrationWithAnimation = useCallback(
    (nextValue: boolean) => {
      if (nextValue === vibrationEnabled) return;
      animateSettingChange();
      setVibrationEnabled(nextValue);
    },
    [animateSettingChange, setVibrationEnabled, vibrationEnabled],
  );

  const setNotificationTimerWithAnimation = useCallback(
    (nextMode: NotificationTimerMode) => {
      if (nextMode === notificationTimerMode) return;
      animateSettingChange();
      setNotificationTimerMode(nextMode);
    },
    [animateSettingChange, notificationTimerMode, setNotificationTimerMode],
  );

  const footerTranslateY = saveBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const footerOpacity = saveBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const darkLabel = t("Dark");
  const lightLabel = t("Light");
  const englishLabel = t("English");
  const espanolLabel = t("Español");
  const onLabel = t("On");
  const offLabel = t("Off");

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title={t("Settings")}
          subtitle="Find and change app options faster."
          onBack={handleBack}
          backTestID="settings-back"
          align="center"
          themeMode={themeMode}
        />

        <SettingsSection title="App Experience" palette={palette}>
          <SettingShell
            icon="moon-outline"
            title={t("Appearance")}
            description="Choose the look that feels best on your eyes."
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={themeMode}
              onChange={(next) => setThemeModeWithAnimation(next as ThemeMode)}
              options={[
                {
                  label: darkLabel,
                  value: "dark",
                  testID: "settings-theme-dark",
                },
                {
                  label: lightLabel,
                  value: "light",
                  testID: "settings-theme-light",
                },
              ]}
              themeMode={themeMode}
            />
          </SettingShell>
          <SectionDivider color={palette.borderSoft} />
          <SettingShell
            icon="language-outline"
            title={t("Language")}
            description="Switch the language used across GapWalk."
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={language}
              onChange={(next) => setLanguageWithAnimation(next as "en" | "es")}
              options={[
                {
                  label: englishLabel,
                  value: "en",
                  testID: "settings-lang-en",
                },
                {
                  label: espanolLabel,
                  value: "es",
                  testID: "settings-lang-es",
                },
              ]}
              themeMode={themeMode}
            />
          </SettingShell>
        </SettingsSection>

        <SettingsSection title="Walking Experience" palette={palette}>
          <SettingShell
            icon="navigate-outline"
            title="Distance Unit"
            description="Choose how distance and walking speed are shown."
            infoText="Choose how distance and walking speed are shown across GapWalk."
            infoId="distance-unit"
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={distanceUnit}
              onChange={(next) =>
                setDistanceUnitWithAnimation(next as "km" | "mi")
              }
              options={[
                {
                  label: "Kilometers",
                  value: "km",
                  testID: "settings-unit-km",
                },
                { label: "Miles", value: "mi", testID: "settings-unit-mi" },
              ]}
              themeMode={themeMode}
            />
          </SettingShell>
          <SectionDivider color={palette.borderSoft} />
          <SettingShell
            icon="timer-outline"
            title="Live Notification Timer"
            description="Control what the active walk notification focuses on."
            infoText={
              "Smart switches automatically. If you start a walk from a GapWalk reminder, it shows minutes left. Otherwise it shows minutes walked.\n\nMinutes walked always shows how long you have been walking.\n\nMinutes left shows the time remaining toward the current walk target."
            }
            infoId="live-notification-timer"
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={notificationTimerMode}
              onChange={(next) =>
                setNotificationTimerWithAnimation(next as NotificationTimerMode)
              }
              options={[
                {
                  label: NOTIFICATION_TIMER_MODE_LABELS.smart,
                  value: "smart",
                  testID: "settings-notification-timer-smart",
                },
                {
                  label: NOTIFICATION_TIMER_MODE_LABELS.elapsed,
                  value: "elapsed",
                  testID: "settings-notification-timer-elapsed",
                },
                {
                  label: NOTIFICATION_TIMER_MODE_LABELS.remaining,
                  value: "remaining",
                  testID: "settings-notification-timer-remaining",
                },
              ]}
              themeMode={themeMode}
              orientation="vertical"
            />
          </SettingShell>
          <SectionDivider color={palette.borderSoft} />
          <SettingShell
            icon="grid-outline"
            title="Walking Screen Cards"
            description="Pick which live stats stay in view while you walk."
            infoText="Pick which stats appear in the walking screen. Keep at least two cards on."
            infoId="walking-screen-cards"
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <View
              style={[
                styles.innerToggleCard,
                {
                  backgroundColor: withAlpha(
                    palette.textPrimary,
                    themeMode === "dark" ? 0.02 : 0.04,
                  ),
                  borderColor: palette.borderSoft,
                },
              ]}
            >
              {ALL_WALK_DISPLAY_CARDS.map((card, index) => {
                const isMandatory = card === "walkDuration";
                const isOn = walkDisplayCards.includes(card);
                const iconName: keyof typeof Ionicons.glyphMap =
                  card === "walkDuration"
                    ? "time-outline"
                    : card === "steps"
                    ? "footsteps-outline"
                    : card === "distance"
                    ? "navigate-outline"
                    : card === "calories"
                    ? "flame-outline"
                    : card === "speed"
                    ? "speedometer-outline"
                    : "trophy-outline";

                return (
                  <React.Fragment key={card}>
                    {index > 0 ? (
                      <SectionDivider color={palette.borderSoft} />
                    ) : null}
                    <ToggleRow
                      icon={iconName}
                      title={WALK_DISPLAY_CARD_LABELS[card]}
                      value={isOn}
                      onToggle={() => handleToggleWalkCard(card)}
                      disabled={isMandatory}
                      testID={`settings-walk-card-${card}`}
                      themeMode={themeMode}
                      palette={palette}
                      statusLabel={isMandatory ? "Always on" : undefined}
                    />
                  </React.Fragment>
                );
              })}
            </View>
          </SettingShell>
        </SettingsSection>

        <SettingsSection title="Weekly & Calendar" palette={palette}>
          <SettingShell
            icon="calendar-clear-outline"
            title="First Day of Week"
            description="Reorder weekly calendars and summaries to match your routine."
            infoText="This changes how weekly calendars, schedule grids, and weekly summaries are ordered."
            infoId="first-day-of-week"
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={firstDayOfWeek}
              onChange={(next) =>
                setFirstDayWithAnimation(next as "sun" | "mon")
              }
              options={[
                {
                  label: "Sunday",
                  value: "sun",
                  testID: "settings-week-start-sun",
                },
                {
                  label: "Monday",
                  value: "mon",
                  testID: "settings-week-start-mon",
                },
              ]}
              themeMode={themeMode}
            />
          </SettingShell>
        </SettingsSection>

        <SettingsSection title="Reminders & Feedback" palette={palette}>
          <SettingShell
            icon="phone-portrait-outline"
            title="Reminder Vibration"
            description="Turn reminder vibration on or off without affecting app tap feedback."
            infoText="Controls vibration for GapWalk reminder notifications. Tap feedback inside the app stays the same."
            infoId="reminder-vibration"
            activeInfoId={activeInfo?.id ?? null}
            onInfoToggle={handleInfoToggle}
          >
            <AnimatedChoiceGroup
              value={vibrationEnabled ? "on" : "off"}
              onChange={(next) => setVibrationWithAnimation(next === "on")}
              options={[
                {
                  label: onLabel,
                  value: "on",
                  testID: "settings-vibration-on",
                },
                {
                  label: offLabel,
                  value: "off",
                  testID: "settings-vibration-off",
                },
              ]}
              themeMode={themeMode}
            />
          </SettingShell>
        </SettingsSection>

        <SettingsSection title="Help & Guidance" palette={palette}>
          <ActionRow
            icon="help-circle-outline"
            title="Replay Tour"
            description="Start the guided dashboard walkthrough again."
            onPress={handleReplayTour}
            testID="settings-replay-tour"
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="star-outline"
            title="Rate GapWalk"
            description="Open the store listing and leave a rating."
            onPress={handleRateGapWalk}
            testID="settings-rate"
            palette={palette}
          />
        </SettingsSection>

        <SettingsSection title="About & Legal" palette={palette}>
          <ActionRow
            icon="information-circle-outline"
            title="App Version"
            rightText={`v${APP_VERSION}`}
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            description="Read how GapWalk handles your data and privacy."
            onPress={() => handleOpenPolicy(PRIVACY_POLICY_URL)}
            testID="settings-privacy"
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="document-text-outline"
            title="Terms of Service"
            description="Review the app terms and usage rules."
            onPress={() => handleOpenPolicy(TERMS_URL)}
            testID="settings-terms"
            palette={palette}
          />
        </SettingsSection>

        <SettingsSection title="Data & Storage" palette={palette}>
          <ActionRow
            icon="download-outline"
            title="Export Walk History"
            description="Create a CSV export of saved walks."
            onPress={handleExportWalkHistory}
            busy={exporting}
            testID="settings-export"
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="trash-outline"
            title="Clear Walk History"
            description="Delete saved walk sessions, routes, and checkpoints."
            onPress={handleClearWalkHistory}
            destructive
            testID="settings-clear-history"
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="refresh-outline"
            title="Clear Cache"
            description="Clear temporary analytics and app cache data."
            onPress={handleClearCache}
            testID="settings-clear-cache"
            palette={palette}
          />
        </SettingsSection>

        {isE2E ? (
          <Card elevated style={styles.e2eCard}>
            <Text
              variant="bodySmall"
              style={[
                styles.sectionLabel,
                styles.e2eLabel,
                { color: palette.textMuted },
              ]}
            >
              E2E Notification Actions
            </Text>
            <View style={styles.e2eStack}>
              <Button
                title="Simulate Start Action"
                onPress={() => {
                  void simulateNotificationStart();
                }}
                testID="e2e-notification-start"
                full
              />
              <Button
                title="Simulate Skip Action"
                onPress={() => {
                  void simulateNotificationSkip();
                }}
                testID="e2e-notification-skip"
                full
                variant="secondary"
              />
              <Button
                title="Show Telemetry Snapshot"
                onPress={() => {
                  void showTelemetrySnapshot();
                }}
                testID="e2e-telemetry-snapshot"
                full
                variant="muted"
              />
            </View>
          </Card>
        ) : null}

        <Animated.View
          style={[
            styles.footerWrap,
            {
              opacity: footerOpacity,
              transform: [{ translateY: footerTranslateY }],
            },
          ]}
        >
          <TwoActionBar
            style={styles.footer}
            noteText={
              hasUnsavedChanges
                ? "Review your changes, then confirm save."
                : "All current settings are saved."
            }
            primaryAction={{
              title: t("Save"),
              onPress: handleSavePress,
              disabled: !hasUnsavedChanges || saving,
              loading: saving,
              testID: "settings-done",
            }}
          />
        </Animated.View>
      </View>

      <InfoTooltipOverlay
        activeInfo={activeInfo}
        onDismiss={closeInfoOverlay}
      />
      <AppModal
        visible={confirmDialog !== null}
        onClose={() => setConfirmDialog(null)}
        title={confirmDialog?.title ?? ""}
      >
        <View style={styles.confirmDialogBody}>
          <Text
            variant="body"
            style={[styles.confirmDialogMessage, { color: palette.textMuted }]}
          >
            {confirmDialog?.message}
          </Text>
          <View style={styles.confirmDialogActions}>
            <Button
              title={t("Cancel")}
              variant="secondary"
              onPress={() => setConfirmDialog(null)}
              style={{ flex: 1 }}
            />
            <Button
              title={confirmDialog?.confirmText ?? t("Save")}
              onPress={() => {
                confirmDialog?.onConfirm();
                setConfirmDialog(null);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </AppModal>
      <SuccessToast
        visible={showSaveToast}
        message={saveToastMessage}
        onDismiss={() => setShowSaveToast(false)}
      />
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    alignSelf: "center",
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionLabel: {
    marginLeft: 2,
    marginBottom: 6,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCard: {
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    marginLeft: 48,
  },
  settingShell: {
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  settingShellRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  settingIconBox: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  settingContent: {
    flex: 1,
    gap: 8,
  },
  settingTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  settingDescription: {
    lineHeight: 17,
  },
  choiceGroup: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  choiceGroupVertical: {
    flexDirection: "column",
  },
  choicePressable: {
    flex: 1,
  },
  choicePressableFull: {
    flex: undefined,
    width: "100%",
  },
  choiceChip: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceChipFull: {
    width: "100%",
  },
  choiceChipLabel: {
    fontFamily: appFontFamily.semibold,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleDisabledPressable: {
    opacity: 0.88,
  },
  toggleDisabled: {
    opacity: 0.72,
  },
  innerToggleCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  toggleRow: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 6,
  },
  toggleTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  toggleTrailing: {
    minWidth: 80,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  lockedBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockedBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: appFontFamily.semibold,
  },
  actionRow: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionRowPressed: {
    opacity: 0.72,
  },
  actionRowDisabled: {
    opacity: 0.6,
  },
  actionTextWrap: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  actionDescription: {
    lineHeight: 18,
  },
  actionTrailing: {
    minWidth: 72,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionRightText: {
    fontFamily: appFontFamily.medium,
  },
  e2eCard: {
    marginTop: 2,
    marginBottom: 18,
  },
  e2eLabel: {
    marginLeft: 0,
  },
  e2eStack: {
    gap: 10,
  },
  footerWrap: {
    marginTop: 4,
  },
  footer: {
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
  },
  confirmDialogBody: {
    paddingTop: 2,
  },
  confirmDialogMessage: {
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  confirmDialogActions: {
    flexDirection: "row",
    gap: 12,
  },
});
