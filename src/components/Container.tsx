import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, ScrollView, StyleProp, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

interface ContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  safeArea?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  scrollable = false,
  safeArea = true,
}) => {
  const Wrapper = safeArea ? SafeAreaView : View;
  const Content = scrollable ? ScrollView : View;
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const appearAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appearAnim]);

  const topGlowColor = themeMode === 'dark' ? 'rgba(46,233,166,0.08)' : 'rgba(46,233,166,0.14)';
  const bottomGlowColor = themeMode === 'dark' ? 'rgba(56,189,248,0.09)' : 'rgba(56,189,248,0.11)';
  const translateY = appearAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <Wrapper style={[styles.safeArea, { backgroundColor: palette.bgApp }, style]}>
      <View style={styles.backdrop} pointerEvents="none">
        <View style={[styles.glow, styles.glowTop, { backgroundColor: topGlowColor }]} />
        <View style={[styles.glow, styles.glowBottom, { backgroundColor: bottomGlowColor }]} />
      </View>

      <Animated.View
        style={[
          styles.contentWrap,
          {
            opacity: appearAnim,
            transform: [{ translateY }],
          },
        ]}
      >
        <Content
          style={scrollable ? styles.scrollView : styles.view}
          contentContainerStyle={scrollable ? styles.scrollContent : undefined}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </Content>
      </Animated.View>
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bgApp,
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  glowTop: {
    top: -120,
    right: -80,
  },
  glowBottom: {
    bottom: -130,
    left: -70,
  },
  contentWrap: {
    flex: 1,
  },
  view: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
