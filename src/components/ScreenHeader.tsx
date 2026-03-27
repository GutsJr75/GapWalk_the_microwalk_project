import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';
import { IconButton } from './IconButton';

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
  themeMode: _themeMode,
}) => {
  const { width: viewportWidth } = useWindowDimensions();
  const [headerWidth, setHeaderWidth] = React.useState(0);
  const backAnchorOffset = headerWidth > 0
    ? theme.layout.contentHorizontal - (viewportWidth - headerWidth) / 2
    : -theme.layout.contentHorizontal;

  return (
    <View
      style={[styles.root, style]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (nextWidth !== headerWidth) setHeaderWidth(nextWidth);
      }}
    >
      {(onBack || rightAccessory) && (
        <View style={styles.topRow}>
          {onBack ? (
            <View style={[styles.backAnchor, { marginLeft: backAnchorOffset }]}>
              <IconButton
                onPress={() => {
                  onBack?.();
                }}
                iconName="back"
                variant="secondary"
                size="icon"
                testID={backTestID}
                accessibilityLabel={backLabel}
              />
            </View>
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
    minHeight: 40,
    marginBottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backAnchor: {
    marginLeft: 0,
  },
  title: {
    marginBottom: theme.spacing.sm,
    fontSize: theme.fontSize.display,
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
