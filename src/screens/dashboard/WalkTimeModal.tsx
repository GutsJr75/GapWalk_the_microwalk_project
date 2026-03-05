import React from 'react';
import {
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
import { TwoDigitTimeInput } from '../../components/TwoDigitTimeInput';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';

type TimePeriod = 'AM' | 'PM';

interface WalkTimeModalNotificationOption {
  value: string;
  label: string;
}

interface WalkTimeModalProps {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  subtitle: string;
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
            <View style={styles.formSections}>
              <View style={styles.fieldSection}>
                <Text variant="bodySmall" style={styles.label}>
                  {title.includes('Change') ? 'Start time' : 'Walk time'}
                </Text>
                <View style={styles.timeRow}>
                  <View style={styles.timeInputRow}>
                    <TwoDigitTimeInput
                      mode="hour"
                      style={[
                        styles.timeInput,
                        { borderColor: palette.borderStrong, color: palette.textPrimary },
                      ]}
                      value={hour}
                      onChange={onHourChange}
                      onBlurNormalize={onHourChange}
                      onAutoComplete={() => minuteInputRef.current?.focus()}
                      placeholder="HH"
                    />
                    <Text variant="body" style={styles.colon}>
                      :
                    </Text>
                    <TwoDigitTimeInput
                      mode="minute"
                      inputRef={minuteInputRef}
                      style={[
                        styles.timeInput,
                        { borderColor: palette.borderStrong, color: palette.textPrimary },
                      ]}
                      value={minute}
                      onChange={onMinuteChange}
                      onBlurNormalize={onMinuteChange}
                      placeholder="MM"
                      returnKeyType="done"
                    />
                  </View>

                  <View
                    style={[
                      styles.periodToggleContainer,
                      { borderColor: palette.borderStrong, backgroundColor: palette.bgSurface },
                    ]}
                  >
                    {(['AM', 'PM'] as const).map((p) => (
                      <Pressable
                        key={p}
                        style={({ pressed }) => [
                          styles.periodBtn,
                          period === p && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          if (Platform.OS !== 'web') {
                            Haptics.selectionAsync().catch(() => { });
                          }
                          onPeriodChange(p);
                        }}
                      >
                        <Text
                          variant="bodySmall"
                          style={[
                            period === p ? styles.periodBtnTextActive : styles.periodBtnText,
                            { color: period === p ? palette.accentOnSolid : palette.textPrimary },
                          ]}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
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
                            pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] },
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
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.lg,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
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
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  timeInput: {
    width: 64,
    minHeight: 52,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: Platform.OS === 'android' ? 10 : 8,
    lineHeight: 24,
    textAlignVertical: 'center',
  },
  colon: {
    width: 16,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  periodToggleContainer: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  periodBtn: {
    minWidth: 40,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  periodBtnText: {
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.sm,
  },
  periodBtnTextActive: {
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
  },
  durationField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.md,
  },
  durationInput: {
    flex: 1,
    minHeight: 52,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    paddingVertical: Platform.OS === 'android' ? 10 : 8,
    paddingRight: theme.spacing.sm,
    lineHeight: 24,
    textAlignVertical: 'center',
    borderWidth: 0,
  },
  durationUnit: {
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.lg,
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
