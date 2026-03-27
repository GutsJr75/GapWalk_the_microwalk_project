import React from 'react';
import { Animated, StyleSheet } from 'react-native';

interface PressGlowOverlayProps {
  scaleAnim: Animated.Value;
  pressScale: number;
  glowColor: string | null;
  glowOpacity: number;
  borderRadius: number;
}

export const PressGlowOverlay: React.FC<PressGlowOverlayProps> = ({
  scaleAnim,
  pressScale,
  glowColor,
  glowOpacity,
  borderRadius,
}) => {
  if (!glowColor || glowOpacity <= 0) return null;

  const overlayOpacity = scaleAnim.interpolate({
    inputRange: [pressScale, 1],
    outputRange: [glowOpacity, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: glowColor,
          opacity: overlayOpacity,
          borderRadius,
        },
      ]}
    />
  );
};
