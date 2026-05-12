import React from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { compactActionTokens, getButtonVisualState } from '../../components/buttonSystem';
import { PressGlowOverlay } from '../../components/PressGlowOverlay';
import { TwoDigitTimeInput } from '../../components/TwoDigitTimeInput';
import { useButtonPressMotion } from '../../hooks/useButtonPressMotion';
import { theme } from '../../theme';
import { type ThemePalette, useThemePalette } from '../../theme/palette';

type TimePeriod = 'AM' | 'PM';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PeriodToggleButton: React.FC<{
  period: TimePeriod;
  selected: boolean;
  onPress: () => void;
  activeTextColor: string;
  inactiveTextColor: string;
  palette: ThemePalette;
}> = ({
  period,
  selected,
  onPress,
  activeTextColor,
  inactiveTextColor,
  palette,
}) => {
  const chipVariant = selected ? 'primary' as const : 'secondary' as const;
  const visualState = React.useMemo(
    () => getButtonVisualState(chipVariant, palette),
    [chipVariant, palette],
  );
  const {
    animatedTransformStyle,
    scaleAnim,
    pressScale,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = useButtonPressMotion({
    onPress,
    size: 'compact',
  });

  return (
    <AnimatedPressable
      style={[
        styles.periodBtn,
        { overflow: 'hidden' as const, borderRadius: compactActionTokens.borderRadius },
        animatedTransformStyle,
      ]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <PressGlowOverlay
        scaleAnim={scaleAnim}
        pressScale={pressScale}
        glowColor={visualState.glowColor}
        glowOpacity={visualState.glowOpacity}
        borderRadius={compactActionTokens.borderRadius}
      />
      <Text
        variant="bodySmall"
        style={[
          selected ? styles.periodBtnTextActive : styles.periodBtnText,
          { color: selected ? activeTextColor : inactiveTextColor },
        ]}
      >
        {period}
      </Text>
    </AnimatedPressable>
  );
};

const PeriodToggle: React.FC<{
  value: TimePeriod;
  onChange: (next: TimePeriod) => void;
  activeBackgroundColor: string;
  activeTextColor: string;
  inactiveTextColor: string;
  backgroundColor: string;
  borderColor: string;
}> = ({
  value,
  onChange,
  activeBackgroundColor,
  activeTextColor,
  inactiveTextColor,
  backgroundColor,
  borderColor,
}) => {
  const palette = useThemePalette();
  const slideAnim = React.useRef(new Animated.Value(value === 'PM' ? 1 : 0)).current;
  const [containerWidth, setContainerWidth] = React.useState(0);

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: value === 'PM' ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideAnim, value]);

  const travel = Math.max(0, containerWidth / 2);
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  return (
    <View
      style={[
        styles.periodToggleContainer,
        { borderColor, backgroundColor },
      ]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Math.abs(nextWidth - containerWidth) > 0.5) {
          setContainerWidth(nextWidth);
        }
      }}
    >
      {travel > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.periodActivePill,
            {
              width: travel,
              backgroundColor: activeBackgroundColor,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {(['AM', 'PM'] as const).map((p) => (
        <PeriodToggleButton
          key={p}
          period={p}
          selected={p === value}
          onPress={() => onChange(p)}
          activeTextColor={activeTextColor}
          inactiveTextColor={inactiveTextColor}
          palette={palette}
        />
      ))}
    </View>
  );
};

interface WalkTimeModalNotificationOption {
  value: string;
  label: string;
}

interface WalkTimeModalProps {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  subtitle: string;
  contextLabel?: string;
  helperText?: string;
  saveLabel: string;
  saving: boolean;
  saveDisabled?: boolean;
  error: string | null;
  hour: string;
  minute: string;
  period: TimePeriod;
  duration: string;
  onHourChange: (v: string) => void;
  onMinuteChange: (v: string) => void;
  onPeriodChange: (v: TimePeriod) => void;
  onDurationChange: (v: string) => void;
  notificationTimingLabel?: string;
  notificationTimingValue?: string;
  notificationTimingOptions?: WalkTimeModalNotificationOption[];
  onNotificationTimingChange?: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const WalkTimeModal: React.FC<WalkTimeModalProps> = ({
  visible,
  onRequestClose,
  title,
  subtitle,
  contextLabel,
  helperText,
  saveLabel,
  saving,
  saveDisabled = false,
  error,
  hour,
  minute,
  period,
  duration,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  onDurationChange,
  notificationTimingLabel,
  notificationTimingValue,
  notificationTimingOptions,
  onNotificationTimingChange,
  onSave,
  onCancel,
}) => {
  const palette = useThemePalette();
  const minuteInputRef = React.useRef<TextInput>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: palette.overlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: palette.bgSurfaceElevated, borderColor: palette.borderSoft },
            ]}
          >
            <Text variant="title" style={styles.title}>
              {title}
            </Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.subtitle}>
              {subtitle}
            </Text>
            {!!contextLabel && (
              <Text variant="bodySmall" color={palette.textMuted} style={styles.contextLabel}>
                {contextLabel}
              </Text>
            )}
            {!!helperText && (
              <Text variant="bodySmall" color={palette.textMuted} style={styles.helperText}>
                {helperText}
              </Text>
            )}
            <View style={styles.formSections}>
              <View style={styles.fieldSection}>
                <Text variant="bodySmall" style={styles.label}>
                  {title.includes('Change') ? 'Start time' : 'Walk time'}
                </Text>
                <View style={styles.timeControls}>
                  <View
                    style={[
                      styles.timeDisplay,
                      { borderColor: palette.borderStrong, backgroundColor: palette.bgSurface },
                    ]}
                  >
                    <TwoDigitTimeInput
                      mode="hour"
                      style={[
                        styles.timeDisplayInput,
                        { color: palette.textPrimary },
                      ]}
                      value={hour}
                      onChange={onHourChange}
                      onBlurNormalize={onHourChange}
                      onAutoComplete={() => minuteInputRef.current?.focus()}
                      placeholder="HH"
                    />
                    <Text variant="body" style={[styles.colon, { color: palette.textPrimary }]}>
                      :
                    </Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      inputRef={minuteInputRef}
                      style={[
                        styles.timeDisplayInput,
                        { color: palette.textPrimary },
                      ]}
                      value={minute}
                      onChange={onMinuteChange}
                      onBlurNormalize={onMinuteChange}
                      placeholder="MM"
                      returnKeyType="done"
                    />
                  </View>
                  <PeriodToggle
                    value={period}
                    onChange={(p) => {
                      if (p === period) return;
                      if (Platform.OS !== 'web') {
                        Haptics.selectionAsync().catch(() => { });
                      }
                      onPeriodChange(p);
                    }}
                    activeBackgroundColor={palette.accentPrimary}
                    activeTextColor={palette.accentOnSolid}
                    inactiveTextColor={palette.textPrimary}
                    backgroundColor={palette.bgSurface}
                    borderColor={palette.borderStrong}
                  />
                </View>
              </View>

              <View style={styles.fieldSection}>
                <Text variant="bodySmall" style={styles.label}>
                  Walk minutes
                </Text>
                <View
                  style={[
                    styles.durationField,
                    { borderColor: palette.borderStrong, backgroundColor: palette.bgSurface },
                  ]}
                >
                  <TextInput
                    style={[styles.durationInput, { color: palette.textPrimary }]}
                    value={duration}
                    onChangeText={(t) => onDurationChange(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    placeholder="10"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text variant="muted" style={styles.durationUnit}>
                    min
                  </Text>
                </View>
              </View>

              {!!notificationTimingOptions?.length && notificationTimingValue && onNotificationTimingChange && (
                <View style={styles.fieldSection}>
                  <Text variant="bodySmall" style={styles.label}>
                    {notificationTimingLabel ?? 'When to send reminders'}
                  </Text>
                  <View style={styles.fieldControls}>
                    {notificationTimingOptions.map((option) => {
                      const selected = notificationTimingValue === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={({ pressed }) => [
                            styles.notifyOptionRow,
                            {
                              backgroundColor: selected ? palette.accentMuted : palette.bgSurface,
                              borderColor: selected ? palette.accentPrimary : palette.borderStrong,
                            },
                            pressed && { opacity: 0.82 },
                          ]}
                          onPress={() => {
                            if (Platform.OS !== 'web') {
                              Haptics.selectionAsync().catch(() => { });
                            }
                            onNotificationTimingChange(option.value);
                          }}
                        >
                          <View
                            style={[
                              styles.radioCircle,
                              { borderColor: selected ? palette.accentPrimary : palette.borderStrong },
                            ]}
                          >
                            {selected && <View style={[styles.radioDot, { backgroundColor: palette.accentPrimary }]} />}
                          </View>
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.notifyOptionText,
                              {
                                color: selected ? palette.accentPrimary : palette.textPrimary,
                                fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.medium,
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {!!error && (
                <Text variant="bodySmall" style={styles.error}>
                  {error}
                </Text>
              )}

              <View style={styles.actionRow}>
                <Button
                  title="Cancel"
                  onPress={onCancel}
                  variant="outline"
                  style={styles.actionBtn}
                  disabled={saving}
                />
                <Button
                  title={saveLabel}
                  onPress={onSave}
                  style={styles.actionBtn}
                  loading={saving}
                  disabled={saving || saveDisabled}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,20,0.68)',
    paddingHorizontal: theme.spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    fontFamily: theme.fontFamily.bold,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.lg,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    fontFamily: theme.fontFamily.regular,
    lineHeight: 20,
  },
  contextLabel: {
    textAlign: 'center',
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 20,
  },
  helperText: {
    textAlign: 'center',
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.fontFamily.regular,
    lineHeight: 19,
    paddingHorizontal: theme.spacing.sm,
  },
  formSections: {
    gap: theme.spacing.lg,
  },
  fieldSection: {
    gap: theme.spacing.sm,
  },
  fieldControls: {
    gap: theme.spacing.sm,
  },
  label: {
    fontFamily: theme.fontFamily.semibold,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  timeControls: {
    flexDirection: 'row',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'flex-end',
    flexWrap: 'nowrap',
    gap: theme.spacing.md + 2,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 138,
    minHeight: 51,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.md + 2,
  },
  timeDisplayInput: {
    minWidth: 32,
    minHeight: 44,
    textAlign: 'center',
    fontFamily: theme.fontFamily.bold,
    fontSize: theme.fontSize.md + 8,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: Platform.OS === 'android' ? 6 : 7,
    lineHeight: 28,
    textAlignVertical: 'center',
  },
  colon: {
    width: 14,
    textAlign: 'center',
    fontFamily: theme.fontFamily.bold,
    fontSize: theme.fontSize.md + 8,
    fontWeight: theme.fontWeight.bold,
  },
  periodToggleContainer: {
    flexDirection: 'row',
    borderRadius: compactActionTokens.borderRadius,
    borderWidth: compactActionTokens.borderWidth,
    overflow: 'hidden',
  },
  periodActivePill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: compactActionTokens.borderRadius,
  },
  periodBtn: {
    minWidth: compactActionTokens.minWidth,
    minHeight: compactActionTokens.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: compactActionTokens.paddingHorizontal,
    zIndex: 1,
  },
  periodBtnText: {
    fontFamily: theme.fontFamily.semibold,
    fontWeight: theme.fontWeight.medium,
    fontSize: compactActionTokens.labelFontSize,
    lineHeight: compactActionTokens.labelLineHeight,
  },
  periodBtnTextActive: {
    fontFamily: theme.fontFamily.bold,
    fontWeight: theme.fontWeight.bold,
    fontSize: compactActionTokens.labelFontSize,
    lineHeight: compactActionTokens.labelLineHeight,
  },
  durationField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 46,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.xs + 2,
  },
  durationInput: {
    width: 56,
    minHeight: 44,
    fontFamily: theme.fontFamily.bold,
    fontSize: theme.fontSize.md + 3,
    fontWeight: theme.fontWeight.semibold,
    textAlign: 'center',
    paddingVertical: Platform.OS === 'android' ? 6 : 7,
    paddingHorizontal: 0,
    lineHeight: 20,
    textAlignVertical: 'center',
    borderWidth: 0,
  },
  durationUnit: {
    fontFamily: theme.fontFamily.semibold,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.md,
    opacity: 0.6,
  },
  notifyOptionRow: {
    minHeight: 56,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  notifyOptionText: {
    fontFamily: theme.fontFamily.medium,
    fontSize: theme.fontSize.sm,
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  error: {
    color: theme.colors.error,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
