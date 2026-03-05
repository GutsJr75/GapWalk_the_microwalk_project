import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { withAlpha } from '../../theme/colorUtils';
import { useThemePalette } from '../../theme/palette';
import { useAppStore } from '../../store';
import { StreakData } from '../../utils/statsUtils';

interface StreakCardProps {
  streak: StreakData;
}

export const StreakCard: React.FC<StreakCardProps> = ({ streak }) => {
  const { themeMode } = useAppStore();
  const palette = useThemePalette();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasStreak = streak.currentStreak > 0;
  const iconColor = hasStreak
    ? (themeMode === 'dark' ? '#fdba74' : '#c2410c')
    : palette.textPrimary;
  const iconWrapBg = hasStreak
    ? withAlpha('#f97316', themeMode === 'dark' ? 0.24 : 0.14)
    : withAlpha(palette.textMuted, themeMode === 'dark' ? 0.22 : 0.12);

  useEffect(() => {
    if (hasStreak) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [hasStreak]);

  return (
    <Card
      elevated
      shadowed={false}
      style={[
        styles.card,
        {
          borderColor: withAlpha(palette.accentPrimary, themeMode === 'dark' ? 0.2 : 0.12),
          backgroundColor: withAlpha(palette.accentPrimary, themeMode === 'dark' ? 0.1 : 0.08),
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: iconWrapBg }]}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons
              name={hasStreak ? 'flame' : 'flame-outline'}
              size={26}
              color={iconColor}
            />
          </Animated.View>
        </View>
        <View style={styles.text}>
          <Text variant="body" style={styles.title}>
            {streak.currentStreak > 0
              ? `${streak.currentStreak} Day${streak.currentStreak > 1 ? 's' : ''} Streak`
              : 'No streak yet'}
          </Text>
          <Text variant="bodySmall" color={palette.textMuted}>
            {streak.currentStreak > 0
              ? streak.longestStreak > streak.currentStreak
                ? `Longest: ${streak.longestStreak} days`
                : 'You are building great consistency.'
              : 'Start a walk today to begin your streak.'}
          </Text>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  text: {
    flex: 1,
  },
  title: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
  },
});
