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
  resetScrollOnMount?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  scrollable = false,
  safeArea = true,
  keyboardAware = true,
  entranceAnimated = true,
  resetScrollOnMount = false,
}) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const appearAnim = useRef(new Animated.Value(entranceAnimated ? 0 : 1)).current;
  const scrollViewRef = useRef<ScrollView>(null);
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

  useEffect(() => {
    if (!scrollable || !resetScrollOnMount) return;

    const resetScroll = () => {
      scrollViewRef.current?.scrollTo?.({ y: 0, animated: false });

      if (Platform.OS === 'web') {
        const webWindow = (globalThis as {
          window?: {
            history?: { scrollRestoration?: 'auto' | 'manual' };
            scrollTo?: (x: number, y: number) => void;
          };
        }).window;
        const webDocument = (globalThis as {
          document?: {
            documentElement?: { scrollTop: number };
            body?: { scrollTop: number };
          };
        }).document;
        const history = webWindow?.history;
        if (history && 'scrollRestoration' in history) {
          history.scrollRestoration = 'manual';
        }
        webWindow?.scrollTo?.(0, 0);
        if (webDocument?.documentElement) webDocument.documentElement.scrollTop = 0;
        if (webDocument?.body) webDocument.body.scrollTop = 0;
      }
    };

    const frameId = requestAnimationFrame(resetScroll);
    const timeoutId = setTimeout(resetScroll, 0);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [resetScrollOnMount, scrollable]);

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

  const ContentWrapper = safeArea ? SafeAreaView : View;

  return (
    <View style={[styles.root, { backgroundColor: palette.bgApp }]}>
      {/* Backdrop fills edge-to-edge (behind status bar and nav bar) */}
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
        {/* Trail-like horizon arcs */}
        <View style={[styles.meshArc, styles.meshTrailTop, { borderColor: meshLineColor }]} />
        <View style={[styles.meshArc, styles.meshTrailMid, { borderColor: meshLineColor, opacity: 0.6 }]} />
        <View style={[styles.meshArc, styles.meshTrailBottom, { borderColor: meshLineColor }]} />
        {/* Organic glow orbs */}
        <View style={[styles.glow, styles.glowTop, { backgroundColor: topGlowColor }]} />
        <View style={[styles.glow, styles.glowCenter, { backgroundColor: centerGlowColor }]} />
        <View style={[styles.glow, styles.glowBottom, { backgroundColor: bottomGlowColor }]} />
      </View>

      {/* Content respects safe area insets */}
      <ContentWrapper style={[styles.contentSafeArea, style]}>
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
                ref={scrollViewRef}
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
      </ContentWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  contentSafeArea: {
    flex: 1,
    backgroundColor: 'transparent',
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
  },
  glowTop: {
    top: -100,
    right: -60,
    width: 300,
    height: 180,
    borderRadius: 90,
  },
  glowCenter: {
    top: '38%',
    right: '15%',
    width: 240,
    height: 140,
    borderRadius: 70,
  },
  glowBottom: {
    bottom: -100,
    left: -50,
    width: 320,
    height: 180,
    borderRadius: 90,
  },
  meshArc: {
    position: 'absolute',
    borderWidth: 1,
  },
  // Wide, flat arcs evoking rolling terrain / walking trail horizon
  meshTrailTop: {
    width: 700,
    height: 160,
    borderRadius: 999,
    top: -110,
    left: -250,
    transform: [{ rotate: '-4deg' }],
  },
  meshTrailMid: {
    width: 600,
    height: 120,
    borderRadius: 999,
    top: '48%',
    right: -280,
    transform: [{ rotate: '3deg' }],
  },
  meshTrailBottom: {
    width: 750,
    height: 180,
    borderRadius: 999,
    bottom: -140,
    right: -350,
    transform: [{ rotate: '5deg' }],
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
