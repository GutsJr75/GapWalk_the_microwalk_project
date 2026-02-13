import React from 'react';
import { StyleSheet } from 'react-native';
import { Card } from './Card';
import { Text } from './Text';
import { theme } from '../theme';

interface ScheduleCardProps {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  title,
  description,
  selected,
  onPress,
}) => {
  return (
    <Card selected={selected} onPress={onPress} style={styles.card}>
      <Text variant="body" style={styles.title}>{title}</Text>
      <Text variant="muted" style={styles.desc}>{description}</Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  title: { fontWeight: theme.fontWeight.semibold, marginBottom: 4 },
  desc: { lineHeight: 18 },
});
