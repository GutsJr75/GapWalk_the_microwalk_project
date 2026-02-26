import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { theme } from '../theme';
import { getThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { Text } from './Text';
import { AppIcon } from './AppIcon';
import { useTapFeedbackAction } from '../lib/useTapFeedbackAction';

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
  const { width: viewportWidth } = useWindowDimensions();
  const themeMode = controlledThemeMode ?? storeThemeMode;
  const palette = getThemePalette(themeMode);
  const backChipBg = palette.bgSurface;
  const backChipBorder = palette.borderStrong;
  const backChipText = palette.textPrimary;
  const backChipRipple = palette.inputBg;
  const [headerWidth, setHeaderWidth] = React.useState(0);
  const backAnchorOffset = headerWidth > 0
    ? theme.layout.contentHorizontal - (viewportWidth - headerWidth) / 2
    : -theme.layout.contentHorizontal;
  const { isTapActive, handlePress, handlePressIn, handlePressOut } = useTapFeedbackAction({
    onPress: () => {
      onBack?.();
    },
    enabled: !!onBack,
  });

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
              <Pressable
                onPress={handlePress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                testID={backTestID}
                accessibilityLabel={backLabel}
                accessibilityRole="button"
                hitSlop={6}
                android_ripple={{ color: backChipRipple }}
                style={({ pressed }) => [
                  styles.backIconBtn,
                  {
                    backgroundColor: backChipBg,
                    borderColor: backChipBorder,
                  },
                  isTapActive && {
                    shadowColor: palette.accentPrimary,
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 4,
                  },
                  pressed && styles.backIconBtnPressed,
                ]}
              >
                <AppIcon name="back" size={18} color={backChipText} />
              </Pressable>
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
  backIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconBtnPressed: {
    transform: [{ translateX: -2 }, { scale: 0.94 }],
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
