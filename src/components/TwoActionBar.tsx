import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { Button } from './Button';
import { Text } from './Text';
import { screenChrome } from '../theme/screenChrome';

type ActionVariant = 'primary' | 'secondary' | 'outline' | 'muted' | 'danger' | 'info';

interface ActionConfig {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  variant?: ActionVariant;
}

interface TwoActionBarProps {
  primaryAction: ActionConfig;
  secondaryAction?: ActionConfig;
  noteText?: string;
  style?: StyleProp<ViewStyle>;
}

export const TwoActionBar: React.FC<TwoActionBarProps> = ({
  primaryAction,
  secondaryAction,
  noteText,
  style,
}) => {
  const palette = useThemePalette();

  return (
    <View style={style}>
      {noteText ? (
        <Text variant="bodySmall" color={palette.textMuted} style={styles.noteText}>
          {noteText}
        </Text>
      ) : null}
      {secondaryAction ? (
        <View style={styles.row}>
          <Button
            title={secondaryAction.title}
            onPress={secondaryAction.onPress}
            disabled={secondaryAction.disabled}
            loading={secondaryAction.loading}
            variant={secondaryAction.variant ?? 'secondary'}
            style={styles.halfBtn}
            testID={secondaryAction.testID}
          />
          <Button
            title={primaryAction.title}
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled}
            loading={primaryAction.loading}
            variant={primaryAction.variant ?? 'primary'}
            style={styles.halfBtn}
            testID={primaryAction.testID}
          />
        </View>
      ) : (
        <Button
          title={primaryAction.title}
          onPress={primaryAction.onPress}
          disabled={primaryAction.disabled}
          loading={primaryAction.loading}
          variant={primaryAction.variant ?? 'primary'}
          full
          testID={primaryAction.testID}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  noteText: {
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: screenChrome.FOOTER_BUTTON_GAP,
  },
  halfBtn: {
    flex: 1,
    minWidth: 0,
  },
});
