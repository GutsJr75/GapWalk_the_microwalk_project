import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
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

  useEffect(() => {
    if (streak.currentStreak > 0) {
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
  }, [streak.currentStreak > 0]);

  return (
    <Card
      elevated
      shadowed={false}
      style={[
        styles.card,
        {
          borderColor: themeMode === 'dark' ? 'rgba(46,233,166,0.2)' : 'rgba(46,233,166,0.12)',
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons
              name={streak.currentStreak > 0 ? 'flame' : 'flame-outline'}
              size={28}
              color={streak.currentStreak > 0 ? '#f97316' : palette.textMuted}
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
    marginBottom: 16,
    backgroundColor: 'rgba(46,233,166,0.1)',
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
    backgroundColor: 'rgba(249,115,22,0.12)',
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
