import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

const BRAND_MARK_SOURCE = require('../../assets/icons/brand-mark.png');
const BRAND_MARK_ASPECT_RATIO = 542 / 859;

interface BrandWalkIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const BrandWalkIcon: React.FC<BrandWalkIconProps> = ({
  size = 20,
  color = '#2ee9a6',
  style,
}) => {
  const markWidth = Math.max(1, Math.round(size * BRAND_MARK_ASPECT_RATIO));

  return (
    <View style={[styles.frame, { width: size, height: size }, style]}>
      <Image
        source={BRAND_MARK_SOURCE}
        resizeMode="contain"
        fadeDuration={0}
        style={{ width: markWidth, height: size, tintColor: color }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
