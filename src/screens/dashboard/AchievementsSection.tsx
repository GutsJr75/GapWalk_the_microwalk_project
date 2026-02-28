import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import {
  ACHIEVEMENTS,
  UnlockedAchievement,
} from '../../data/repositories/achievementsRepo';

interface AchievementsSectionProps {
  unlockedAchievements: UnlockedAchievement[];
}

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  unlockedAchievements,
}) => {
  const palette = useThemePalette();

  if (unlockedAchievements.length === 0) return null;

  return (
    <Card elevated style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="trophy-outline" size={18} color={theme.colors.accentPrimary} />
        <Text variant="body" style={styles.title}>
          Achievements ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {ACHIEVEMENTS.map((def) => {
          const isUnlocked = unlockedAchievements.some((u) => u.id === def.id);
          return (
            <View key={def.id} style={[styles.badgeItem, !isUnlocked && styles.badgeLocked]}>
              <View style={[styles.badgeCircle, { borderColor: isUnlocked ? def.color : palette.textMuted }]}>
                <Ionicons
                  name={def.icon as any}
                  size={20}
                  color={isUnlocked ? def.color : palette.textMuted}
                />
              </View>
              <Text
                variant="bodySmall"
                style={[styles.badgeLabel, !isUnlocked && { color: palette.textMuted }]}
                numberOfLines={1}
              >
                {def.title}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontWeight: theme.fontWeight.semibold,
  },
  scroll: {
    marginHorizontal: -4,
  },
  badgeItem: {
    alignItems: 'center',
    width: 68,
    marginHorizontal: 4,
  },
  badgeLocked: {
    opacity: 0.35,
  },
  badgeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
});
