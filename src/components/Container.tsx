import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  ScrollView,
  StyleProp,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  scrollable = false,
  safeArea = true,
  keyboardAware = true,
}) => {
  const Wrapper = safeArea ? SafeAreaView : View;
  const palette = useThemePalette();
  const { themeMode } = useAppStore();
  const appearAnim = useRef(new Animated.Value(0)).current;
  const keyboardAvoidEnabled = keyboardAware && scrollable;

  useEffect(() => {
    Animated.spring(appearAnim, {
      toValue: 1,
      tension: 60,
      friction: 12,
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
