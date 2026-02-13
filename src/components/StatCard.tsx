import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Card } from './Card';
import { Text } from './Text';
import { theme } from '../theme';

interface StatCardProps {
  title: string;
  current: number;
  target: number;
  unitLabel?: string;
  // If we need different styles later, we can add a variant prop
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  current,
  target,
  unitLabel = 'minutes',
}) => {
  const pct = target > 0 ? Math.min((current / target), 1) : 0;
  const animatedValue = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Circle config
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    // Animate progress circle
    Animated.timing(animatedValue, {
      toValue: pct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Pulse animation when progress changes
    if (current > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [current, pct]);

  const [animatedPct, setAnimatedPct] = React.useState(0);

  useEffect(() => {
    animatedValue.addListener(({ value }) => {
      setAnimatedPct(value);
    });
    return () => {
      animatedValue.removeAllListeners();
    };
  }, []);

  const currentStrokeDashoffset = circumference - animatedPct * circumference;

  return (
    <Card style={styles.card} elevated>
      <Text variant="body" style={styles.title}>{title}</Text>
      
      <View style={styles.circleContainer}>
        <Animated.View style={[styles.svgWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
              />
              <Circle
                stroke={animatedPct >= 1 ? '#4ade80' : theme.colors.accentPrimary}
                strokeWidth={strokeWidth}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={currentStrokeDashoffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.circleText}>
            <Text variant="title" style={styles.centerValue}>
              {current}<Text variant="bodySmall" color={theme.colors.textMuted}>/{target}</Text>
            </Text>
          </View>
        </Animated.View>
      </View>

      <Text variant="bodySmall" style={styles.completion}>
        {pct >= 1 ? '🎉 Goal achieved!' : `Completion: ${current} ${unitLabel}/${target} ${unitLabel}`}
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16, paddingVertical: 16 },
  title: { fontWeight: theme.fontWeight.semibold, marginBottom: 12 },
  circleContainer: { alignItems: 'center', marginBottom: 12 },
  svgWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  circleText: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  centerValue: { fontWeight: theme.fontWeight.bold },
  completion: { color: theme.colors.textMuted, textAlign: 'center' },
});
