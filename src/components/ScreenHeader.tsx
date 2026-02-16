import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
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
}) => {
  const palette = useThemePalette();

  return (
    <View style={[styles.root, style]}>
      {(onBack || rightAccessory) && (
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              testID={backTestID}
              accessibilityLabel={backTestID}
              android_ripple={{ color: 'rgba(15,23,42,0.10)' }}
              style={({ pressed }) => [
                styles.backChip,
                {
                  backgroundColor: palette.bgSurfaceElevated,
                  borderColor: palette.borderStrong,
                },
                pressed && styles.backChipPressed,
              ]}
            >
              <AppIcon name="back" size={16} color={palette.textMuted} />
              <Text variant="bodySmall" style={styles.backLabel}>{backLabel}</Text>
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
    marginBottom: theme.spacing.md,
  },
  topRow: {
    minHeight: 36,
    marginBottom: theme.spacing.sm,
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
    marginBottom: 4,
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

