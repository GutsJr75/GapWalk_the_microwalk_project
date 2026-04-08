import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { BrandWalkIcon } from './BrandWalkIcon';
import { useThemePalette } from '../theme/palette';
import { theme } from '../theme';

export type ScreenStateVariant = 'loading' | 'error' | 'empty';

interface ScreenStateProps {
  variant: ScreenStateVariant;
  title: string;
  subtitle?: string;
  onRetry?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

const isWalkPersonIcon = (
  iconName: React.ComponentProps<typeof Ionicons>['name'],
): boolean => iconName === 'walk' || iconName === 'walk-outline';

export const ScreenState: React.FC<ScreenStateProps> = ({
  variant,
  title,
  subtitle,
  onRetry,
  icon,
}) => {
  const palette = useThemePalette();

  if (variant === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.accentPrimary} />
        <Text variant="body" color={palette.textMuted} style={styles.title}>
          {title}
        </Text>
      </View>
    );
  }

  const iconName = icon ?? (variant === 'error' ? 'alert-circle-outline' : 'walk-outline');
  const iconColor = variant === 'error' ? theme.colors.error : palette.accentPrimary;

  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: palette.bgSurfaceElevated }]}>
        {isWalkPersonIcon(iconName) ? (
          <BrandWalkIcon size={48} color={iconColor} />
        ) : (
          <Ionicons
            name={iconName}
            size={48}
            color={iconColor}
          />
        )}
      </View>
      <Text variant="title" style={[styles.title, { color: palette.textPrimary }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color={palette.textMuted} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {variant === 'error' && onRetry ? (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="secondary"
          style={styles.retryButton}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    minHeight: 180,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    maxWidth: 280,
  },
  retryButton: {
    marginTop: theme.spacing.sm,
  },
});
