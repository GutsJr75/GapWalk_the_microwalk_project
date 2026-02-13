import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity, StyleProp } from 'react-native';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  selected = false,
  onPress,
  disabled = false,
  elevated = false,
}) => {
  const Wrapper = onPress ? TouchableOpacity : View;
  const palette = useThemePalette();

  return (
    <Wrapper
      style={[
        styles.card,
        {
          backgroundColor: elevated ? palette.bgSurfaceElevated : palette.bgSurface,
          borderColor: palette.borderSoft,
        },
        selected && styles.selectedCard,
        disabled && styles.disabledCard,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
    >
      {children}
    </Wrapper>
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
});

