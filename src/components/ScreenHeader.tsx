import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { Text } from './Text';
import { AppIcon } from './AppIcon';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  backTestID?: string;
  align?: 'center' | 'left';
  style?: StyleProp<ViewStyle>;
  rightAccessory?: React.ReactNode;
  themeMode?: 'dark' | 'light';
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  backTestID,
  align = 'center',
  style,
  rightAccessory,
  themeMode: controlledThemeMode,
}) => {
  const { themeMode: storeThemeMode } = useAppStore();
  const themeMode = controlledThemeMode ?? storeThemeMode;
  const palette = getThemePalette(themeMode);
  const backChipBg = palette.bgSurface;
  const backChipBorder = palette.borderStrong;
  const backChipText = palette.textPrimary;
  const backChipRipple = themeMode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';

  return (
    <View style={[styles.root, style]}>
      {(onBack || rightAccessory) && (
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              testID={backTestID}
              accessibilityLabel={backTestID}
              android_ripple={{ color: backChipRipple }}
              style={({ pressed }) => [
                styles.backChip,
                {
                  backgroundColor: backChipBg,
                  borderColor: backChipBorder,
                },
                pressed && styles.backChipPressed,
              ]}
            >
              <AppIcon name="back" size={16} color={backChipText} />
              <Text variant="bodySmall" style={[styles.backLabel, { color: backChipText }]}>{backLabel}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {rightAccessory}
        </View>
      )}

      <Text
        variant="title"
        style={StyleSheet.flatten([
          styles.title,
          align === 'left' ? styles.textLeft : styles.textCenter,
        ])}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="muted"
          style={StyleSheet.flatten([
            styles.subtitle,
            align === 'left' ? styles.textLeft : styles.textCenter,
          ])}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  topRow: {
    minHeight: 36,
    marginBottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backChipPressed: {
    transform: [{ scale: 0.985 }],
  },
  backLabel: {
    fontWeight: theme.fontWeight.semibold,
  },
  title: {
    marginBottom: 8,
    fontSize: theme.fontSize.xl + 2,
  },
  subtitle: {
    lineHeight: 20,
  },
  textCenter: {
    textAlign: 'center',
  },
  textLeft: {
    textAlign: 'left',
  },
});
