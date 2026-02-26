import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  ScrollView,
  StyleProp,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

interface ContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  safeArea?: boolean;
  keyboardAware?: boolean;
  entranceAnimated?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  scrollable = false,
  safeArea = true,
  keyboardAware = true,
  entranceAnimated = true,
}) => {
  const Wrapper = safeArea ? SafeAreaView : View;
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const appearAnim = useRef(new Animated.Value(entranceAnimated ? 0 : 1)).current;
  const keyboardAvoidEnabled = keyboardAware && scrollable;

  useEffect(() => {
    if (!entranceAnimated) {
      appearAnim.setValue(1);
      return;
    }
    Animated.spring(appearAnim, {
      toValue: 1,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [appearAnim, entranceAnimated]);

  const topGlowColor = themeMode === 'dark' ? 'rgba(46,233,166,0.05)' : 'rgba(46,233,166,0.14)';
  const bottomGlowColor = themeMode === 'dark' ? 'rgba(56,189,248,0.06)' : 'rgba(56,189,248,0.11)';
  const centerGlowColor = themeMode === 'dark' ? 'rgba(99,102,241,0.04)' : 'rgba(37,99,235,0.08)';
  const meshLineColor = themeMode === 'dark' ? 'rgba(138,160,199,0.12)' : 'rgba(40,60,94,0.14)';
  const baseGradientColors: [string, string, string] = themeMode === 'dark'
    ? ['#040a16', '#071022', '#050b18']
    : ['#edf3fb', '#e3edf8', '#dce8f5'];
  const ambientGradientColors: [string, string, string] = themeMode === 'dark'
    ? ['rgba(46,233,166,0.03)', 'rgba(56,189,248,0.025)', 'rgba(4,10,22,0)']
    : ['rgba(5,150,105,0.10)', 'rgba(3,105,161,0.08)', 'rgba(237,243,251,0)'];
  const translateY = appearAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  const contentMotionStyle = entranceAnimated
    ? {
      opacity: appearAnim,
      transform: [{ translateY }],
    }
    : null;

  return (
    <Wrapper style={[styles.safeArea, { backgroundColor: palette.bgApp }, style]}>
      <View style={styles.backdrop} pointerEvents="none">
        <LinearGradient
          colors={baseGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.baseGradient}
        />
        <LinearGradient
          colors={ambientGradientColors}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.ambientGradient}
        />
        <View style={[styles.meshArc, styles.meshArcTop, { borderColor: meshLineColor }]} />
        <View style={[styles.meshArc, styles.meshArcBottom, { borderColor: meshLineColor }]} />
        <View style={[styles.glow, styles.glowTop, { backgroundColor: topGlowColor }]} />
        <View style={[styles.glow, styles.glowCenter, { backgroundColor: centerGlowColor }]} />
        <View style={[styles.glow, styles.glowBottom, { backgroundColor: bottomGlowColor }]} />
      </View>

      <Animated.View
        style={[
          styles.contentWrap,
          contentMotionStyle,
        ]}
      >
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={keyboardAvoidEnabled && Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={keyboardAvoidEnabled}
        >
          {scrollable ? (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.view}>{children}</View>
          )}
        </KeyboardAvoidingView>
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
  baseGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  ambientGradient: {
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
  glowCenter: {
    top: '32%',
    right: '20%',
    width: 210,
    height: 210,
    borderRadius: 105,
  },
  glowBottom: {
    bottom: -130,
    left: -70,
  },
  meshArc: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 999,
  },
  meshArcTop: {
    width: 520,
    height: 240,
    top: -155,
    left: -210,
    transform: [{ rotate: '-8deg' }],
  },
  meshArcBottom: {
    width: 620,
    height: 300,
    bottom: -210,
    right: -320,
    transform: [{ rotate: '9deg' }],
  },
  contentWrap: {
    flex: 1,
  },
  keyboardWrap: {
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
