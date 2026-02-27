import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { useAppStore } from '../../store';

interface YesterdayCardProps {
  message: string;
}

export const YesterdayCard: React.FC<YesterdayCardProps> = ({ message }) => {
  const { themeMode } = useAppStore();

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: themeMode === 'dark' ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.12)',
          borderColor: themeMode === 'dark' ? 'rgba(251,191,36,0.18)' : 'rgba(251,191,36,0.22)',
        },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="heart-outline" size={20} color="#fbbf24" style={{ marginRight: 10 }} />
        <Text variant="bodySmall" style={{ flex: 1, lineHeight: 20 }}>{message}</Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
