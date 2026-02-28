import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';
import { useAppStore } from '../../store';
import { AchievementId, getAchievementDef } from '../../data/repositories/achievementsRepo';

interface BadgeUnlockedModalProps {
  visible: boolean;
  onClose: () => void;
  newBadgeIds: AchievementId[];
  animValue: Animated.Value;
}

export const BadgeUnlockedModal: React.FC<BadgeUnlockedModalProps> = ({
  visible,
  onClose,
  newBadgeIds,
  animValue,
}) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: palette.overlay }]} onPress={onClose}>
        <Animated.View
          style={[
            styles.content,
            {
              backgroundColor: palette.bgSurfaceElevated,
              borderColor: themeMode === 'dark' ? 'rgba(234,179,8,0.35)' : 'rgba(234,179,8,0.42)',
              transform: [
                {
                  scale: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1],
                  }),
                },
              ],
              opacity: animValue,
            },
          ]}
        >
          <Ionicons name="trophy" size={48} color="#eab308" style={{ marginBottom: 12 }} />
          <Text variant="title" style={styles.title}>
            {newBadgeIds.length === 1 ? 'Badge Unlocked!' : `${newBadgeIds.length} Badges Unlocked!`}
          </Text>
          {newBadgeIds.map((id) => {
            const def = getAchievementDef(id);
            if (!def) return null;
            return (
              <View key={id} style={styles.item}>
                <View style={[styles.badgeCircle, { borderColor: def.color }]}>
                  <Ionicons name={def.icon as any} size={20} color={def.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: theme.fontWeight.semibold }}>
                    {def.title}
                  </Text>
                  <Text variant="bodySmall" color={palette.textMuted}>
                    {def.description}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text variant="bodySmall" color={palette.textMuted} style={{ marginTop: 12 }}>
            Tap anywhere to dismiss
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '84%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  title: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 16,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    width: '100%',
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
});
