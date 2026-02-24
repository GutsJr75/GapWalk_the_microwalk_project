import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
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
            <View style={styles.backAnchor}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }
                  onBack();
                }}
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
    marginLeft: -theme.layout.contentHorizontal,
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
