import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  elevated?: boolean;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  selected = false,
  onPress,
  disabled = false,
  elevated = false,
  testID,
}) => {
  const palette = useThemePalette();
  const cardBaseStyle = [
    styles.card,
    {
      backgroundColor: elevated ? palette.bgSurfaceElevated : palette.bgSurface,
      borderColor: palette.borderSoft,
    },
    selected && styles.selectedCard,
    disabled && styles.disabledCard,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          cardBaseStyle,
          pressed && !disabled && styles.pressedCard,
        ]}
        onPress={onPress}
        disabled={disabled}
        android_ripple={{ color: 'rgba(15,23,42,0.08)' }}
        testID={testID}
        accessibilityLabel={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardBaseStyle} testID={testID} accessibilityLabel={testID}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bgSurface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.04)',
    width: '100%',
  },
  selectedCard: {
    borderColor: theme.colors.accentPrimary,
    borderWidth: 2,
  },
  disabledCard: {
    opacity: 0.4,
  },
  pressedCard: {
    transform: [{ scale: 0.992 }],
  },
});
