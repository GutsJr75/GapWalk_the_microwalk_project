import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { useAppStore } from '../../store';

interface CelebrationOverlayProps {
  visible: boolean;
  animValue: Animated.Value;
  currentStreak: number;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  visible,
  animValue,
  currentStreak,
}) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: palette.overlay,
          opacity: animValue,
          transform: [
            {
              scale: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.content,
          {
            backgroundColor: palette.bgSurfaceElevated,
            borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.35)' : 'rgba(46,233,166,0.42)',
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={52} color={theme.colors.accentPrimary} />
        <Text variant="title" style={styles.text}>Daily goal achieved</Text>
        <Text variant="bodySmall" color={palette.textMuted} style={styles.subtext}>
          {currentStreak > 0
            ? `Current streak: ${currentStreak} day${currentStreak > 1 ? 's' : ''}.`
            : 'Excellent work today.'}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2,8,20,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    borderRadius: 20,
    width: '84%',
    maxWidth: 330,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  text: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    textAlign: 'center',
  },
});
