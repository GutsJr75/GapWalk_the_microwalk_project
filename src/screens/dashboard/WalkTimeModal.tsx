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
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';

type TimePeriod = 'AM' | 'PM';

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
  onSave,
  onCancel,
}) => {
  const palette = useThemePalette();

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

            <Text variant="bodySmall" style={styles.label}>
              {title.includes('Change') ? 'Start time' : 'Walk time'}
            </Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[
                  styles.timeInput,
                  { borderColor: palette.borderStrong, color: palette.textPrimary },
                ]}
                value={hour}
                onChangeText={(t) => onHourChange(t.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="HH"
                placeholderTextColor={palette.textMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text variant="body" style={styles.colon}>
                :
              </Text>
              <TextInput
                style={[
                  styles.timeInput,
                  { borderColor: palette.borderStrong, color: palette.textPrimary },
                ]}
                value={minute}
                onChangeText={(t) => onMinuteChange(t.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="MM"
                placeholderTextColor={palette.textMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
              <View style={styles.periodRow}>
                {(['AM', 'PM'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={({ pressed }) => [
                      styles.periodBtn,
                      { borderColor: palette.borderStrong },
                      period === p && styles.periodBtnActive,
                      pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Haptics.selectionAsync().catch(() => {});
                      }
                      onPeriodChange(p);
                    }}
                  >
                    <Text
                      variant="bodySmall"
                      style={[
                        period === p ? styles.periodBtnTextActive : styles.periodBtnText,
                        { color: period === p ? '#06261d' : palette.textPrimary },
                      ]}
                    >
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text variant="bodySmall" style={styles.label}>
              Walk minutes
            </Text>
            <View style={styles.durationRow}>
              <TextInput
                style={[
                  styles.durationInput,
                  { borderColor: palette.borderStrong, color: palette.textPrimary },
                ]}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,20,0.62)',
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: theme.fontWeight.bold,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 14,
  },
  label: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  timeInput: {
    width: 56,
    minHeight: 40,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  colon: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  periodBtn: {
    minWidth: 44,
    minHeight: 34,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  periodBtnActive: {
    backgroundColor: theme.colors.accentPrimary,
    borderColor: theme.colors.accentPrimary,
  },
  periodBtnText: {
    fontWeight: theme.fontWeight.medium,
  },
  periodBtnTextActive: {
    fontWeight: theme.fontWeight.semibold,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  durationInput: {
    width: 96,
    minHeight: 40,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'android' ? 8 : 6,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  durationUnit: {
    fontWeight: theme.fontWeight.medium,
  },
  error: {
    color: theme.colors.error,
    marginTop: 4,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
  },
});
