import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  UIManager,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { RootStackParamList } from "../../App";
import { Container } from "../components/Container";
import { Text } from "../components/Text";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { SuccessToast } from "../components/SuccessToast";
import {
  ActiveInfoState,
  InfoTooltipOverlay,
} from "../components/InfoTooltip";
import {
  ActionRow,
  AnimatedChoiceGroup,
  SectionDivider,
  SettingShell,
  SettingsSection,
  ToggleRow,
  settingsStyles,
} from "../components/settings";
import { createLayoutMotionConfig } from "../theme/motion";
import { withAlpha } from "../theme/colorUtils";
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
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import type { ThemeMode } from "../components/settings";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PRIVACY_POLICY_URL = "https://gapwalk.com/privacy";
const TERMS_URL = "https://gapwalk.com/terms";

const isFabric = !!(globalThis as { nativeFabricUIManager?: unknown })
  .nativeFabricUIManager;

if (
  Platform.OS === "android" &&
  !isFabric &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode,
    setThemeMode,
    language,
    setLanguage,
    distanceUnit,
    setDistanceUnit,
    vibrationEnabled,
    setVibrationEnabled,
    notificationTimerMode,
    setNotificationTimerMode,
    walkDisplayCards,
    setWalkDisplayCards,
  } = useAppStore();
  const { reduceMotion } = useReducedMotionPreference();
  const palette = getThemePalette(themeMode);

  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState("Settings saved");
  const [exporting, setExporting] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfoState | null>(null);

  const isE2E = process.env.EXPO_PUBLIC_E2E === "1";

  const t = useCallback(
    (key: string) => translateLiteral(key, language),
    [language],
  );

  const persistSettingsFromStore = useCallback(async () => {
    try {
      const s = useAppStore.getState();
      await authStorage.saveThemeMode(s.themeMode);
      await authStorage.saveLanguage(s.language);
      await authStorage.saveDistanceUnit(s.distanceUnit);
      await authStorage.saveVibrationEnabled(s.vibrationEnabled);
      await authStorage.saveNotificationTimerMode(s.notificationTimerMode);
      await authStorage.saveWalkDisplayCards(s.walkDisplayCards);

      await notificationService.setReminderVibrationEnabled(s.vibrationEnabled);

      if (androidWalkTracking.isSupported()) {
        await androidWalkTracking.updateNotificationTimerMode(
          s.notificationTimerMode,
        );
      }
    } catch (error) {
      Alert.alert("Could not save settings", toUserFriendlyError(error));
    }
  }, []);

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setActiveInfo(null);
    });
    return unsubscribeBlur;
  }, [navigation]);

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

  const handleBack = useCallback(() => {
    closeInfoOverlay();
    navigation.navigate("Dashboard", { openMenu: true });
  }, [closeInfoOverlay, navigation]);

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

  const handleReplayDashboardTour = useCallback(() => {
    closeInfoOverlay();
    navigation.navigate("Dashboard", { replayDashboardTour: true });
  }, [closeInfoOverlay, navigation]);

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
        void persistSettingsFromStore();
        return;
      }

      const ordered = ALL_WALK_DISPLAY_CARDS.filter(
        (currentCard) =>
          walkDisplayCards.includes(currentCard) || currentCard === card,
      );
      setWalkDisplayCards(ordered);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      persistSettingsFromStore,
      setWalkDisplayCards,
      walkDisplayCards,
    ],
  );

  const setThemeModeWithAnimation = useCallback(
    (nextThemeMode: ThemeMode) => {
      if (nextThemeMode === themeMode) return;
      animateSettingChange();
      setThemeMode(nextThemeMode);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      persistSettingsFromStore,
      setThemeMode,
      themeMode,
    ],
  );

  const setLanguageWithAnimation = useCallback(
    (nextLanguage: "en" | "es") => {
      if (nextLanguage === language) return;
      animateSettingChange();
      setLanguage(nextLanguage);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      language,
      persistSettingsFromStore,
      setLanguage,
    ],
  );

  const setDistanceUnitWithAnimation = useCallback(
    (nextDistanceUnit: "km" | "mi") => {
      if (nextDistanceUnit === distanceUnit) return;
      animateSettingChange();
      setDistanceUnit(nextDistanceUnit);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      distanceUnit,
      persistSettingsFromStore,
      setDistanceUnit,
    ],
  );

  const setVibrationWithAnimation = useCallback(
    (nextValue: boolean) => {
      if (nextValue === vibrationEnabled) return;
      animateSettingChange();
      setVibrationEnabled(nextValue);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      persistSettingsFromStore,
      setVibrationEnabled,
      vibrationEnabled,
    ],
  );

  const setNotificationTimerWithAnimation = useCallback(
    (nextMode: NotificationTimerMode) => {
      if (nextMode === notificationTimerMode) return;
      animateSettingChange();
      setNotificationTimerMode(nextMode);
      void persistSettingsFromStore();
    },
    [
      animateSettingChange,
      notificationTimerMode,
      persistSettingsFromStore,
      setNotificationTimerMode,
    ],
  );

  const darkLabel = t("Dark");
  const lightLabel = t("Light");
  const englishLabel = t("English");
  const espanolLabel = t("Español");
  const onLabel = t("On");
  const offLabel = t("Off");

  return (
    <Container scrollable>
      <View style={settingsStyles.content}>
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
                settingsStyles.innerToggleCard,
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
            icon="star-outline"
            title="Rate GapWalk"
            description="Open the store listing and leave a rating."
            onPress={handleRateGapWalk}
            testID="settings-rate"
            palette={palette}
          />
          <SectionDivider color={palette.borderSoft} />
          <ActionRow
            icon="play-circle-outline"
            title="Replay Dashboard Tour"
            description="Run the guided walkthrough on the dashboard again."
            onPress={handleReplayDashboardTour}
            testID="settings-replay-dashboard-tour"
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
          <Card elevated style={settingsStyles.e2eCard}>
            <Text
              variant="bodySmall"
              style={[
                settingsStyles.sectionLabel,
                settingsStyles.e2eLabel,
                { color: palette.textMuted },
              ]}
            >
              E2E Notification Actions
            </Text>
            <View style={settingsStyles.e2eStack}>
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
      </View>

      <InfoTooltipOverlay
        activeInfo={activeInfo}
        onDismiss={closeInfoOverlay}
      />
      <SuccessToast
        visible={showSaveToast}
        message={saveToastMessage}
        onDismiss={() => setShowSaveToast(false)}
      />
    </Container>
  );
};
