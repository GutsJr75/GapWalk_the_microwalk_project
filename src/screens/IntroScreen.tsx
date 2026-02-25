import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet, TouchableOpacity, Animated, Easing, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import Svg, { Path } from 'react-native-svg';
import { analyticsService } from '../lib/analytics';
import { getAuth0Discovery, getAuth0RequestConfig, isAuth0Configured } from '../lib/auth0';

WebBrowser.maybeCompleteAuthSession();

interface Props extends NativeStackScreenProps<RootStackParamList, 'Intro'> {
  isAuthenticated?: boolean;
  onAuthenticated?: () => void;
}

export const IntroScreen: React.FC<Props> = ({
  navigation,
  isAuthenticated = false,
  onAuthenticated,
}) => {
  const { hasSetPreferences } = useAppStore();
  const palette = useThemePalette();
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const howAnim = useRef(new Animated.Value(0)).current;
  const handledAuthResponseRef = useRef<string | null>(null);
  const { height: viewportHeight } = useWindowDimensions();
  const authConfigured = isAuth0Configured();
  const discovery = getAuth0Discovery();

  const verticalScreenPadding = Math.round(viewportHeight * 0.1);
  const heroVerticalPadding = Math.max(theme.spacing.md, Math.round(viewportHeight * 0.02));
  const heroToWhyGap = Math.max(theme.spacing.xl, Math.round(viewportHeight * 0.055));
  const whyToHowGap = Math.max(theme.spacing.lg, Math.round(viewportHeight * 0.045));
  const ctaTopGap = Math.max(theme.spacing.md, Math.round(viewportHeight * 0.03));
  const [loginRequest, loginResponse, promptLogin] = AuthSession.useAuthRequest(
    getAuth0RequestConfig('login'),
    discovery ?? null
  );
  const [signupRequest, signupResponse, promptSignup] = AuthSession.useAuthRequest(
    getAuth0RequestConfig('signup'),
    discovery ?? null
  );

  useEffect(() => {
    Animated.timing(howAnim, {
      toValue: showHowItWorks ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showHowItWorks, howAnim]);

  useEffect(() => {
    const activeResponse = loginResponse ?? signupResponse;
    if (!activeResponse) return;

    const responseKey =
      activeResponse.type === 'success'
        ? `success:${activeResponse.params.code ?? ''}`
        : `other:${activeResponse.type}`;
    if (handledAuthResponseRef.current === responseKey) return;
    handledAuthResponseRef.current = responseKey;

    if (activeResponse.type === 'success') {
      setIsAuthLoading(false);
      onAuthenticated?.();
      return;
    }

    if (activeResponse.type === 'dismiss' || activeResponse.type === 'cancel') {
      setIsAuthLoading(false);
      return;
    }

    setIsAuthLoading(false);
    const details =
      activeResponse.type === 'error'
        ? activeResponse.error?.message ?? 'Please try again.'
        : 'Please try again.';
    Alert.alert('Login failed', details);
  }, [loginResponse, onAuthenticated, signupResponse]);

  const chevronRotate = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const detailsHeight = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 176],
  });

  const detailsOpacity = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const detailsTranslateY = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  const detailsMarginTop = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const handleCta = () => {
    analyticsService.track('onboarding_cta_pressed', {
      hasSetPreferences,
    });
    if (hasSetPreferences) {
      navigation.navigate('Dashboard');
    } else {
      navigation.navigate('ScheduleSetup');
    }
  };

  const runAuth = async (mode: 'login' | 'signup') => {
    if (!authConfigured) {
      Alert.alert(
        'Auth0 is not configured',
        'Add EXPO_PUBLIC_AUTH0_DOMAIN and EXPO_PUBLIC_AUTH0_CLIENT_ID to your .env file.'
      );
      return;
    }

    const request = mode === 'login' ? loginRequest : signupRequest;
    if (!request) {
      Alert.alert('Please wait', 'Authentication is still loading.');
      return;
    }

    setIsAuthLoading(true);
    try {
      const prompt = mode === 'login' ? promptLogin : promptSignup;
      await prompt();
    } catch (error) {
      setIsAuthLoading(false);
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Login failed', message);
    }
  };

  return (
    <Container scrollable>
      <View
        style={[
          styles.screen,
          {
            minHeight: viewportHeight,
            paddingTop: verticalScreenPadding,
            paddingBottom: verticalScreenPadding,
          },
        ]}
      >
        <View style={styles.topContent}>
          <View style={[styles.headerFrame, { paddingVertical: heroVerticalPadding }]}>
            <View style={styles.headingRow}>
              <Text variant="heading" style={[styles.headingGap, { color: palette.textPrimary }]}>Gap</Text>
              <Text variant="heading" style={[styles.headingWalk, { color: palette.textMuted }]}>Walk</Text>
            </View>
            <Text variant="body" style={styles.subtitle}>
              Busy schedule? No time to exercise? Turn your daily schedule gaps into short, realistic walks.
            </Text>
          </View>

          <View style={[styles.section, { marginTop: heroToWhyGap }]}>
            <Text variant="title" style={styles.sectionTitle}>Why it works</Text>

            <View style={styles.feature}>
              <View style={[styles.iconCircle, { backgroundColor: palette.bgSurfaceElevated }]}>
                <Text style={styles.iconEmoji}>{'\uD83D\uDCC5'}</Text>
              </View>
              <View style={styles.featureText}>
                <Text variant="body" style={styles.featureTitle}>Fits real gaps</Text>
                <Text variant="bodySmall">
                  GapWalk only sends you notifications during schedule gaps that actually exist between your commitments.
                </Text>
              </View>
            </View>

            <View style={styles.feature}>
              <View style={[styles.iconCircle, { backgroundColor: palette.bgSurfaceElevated }]}>
                <Text style={styles.iconEmoji}>{'\uD83D\uDEB6'}</Text>
              </View>
              <View style={styles.featureText}>
                <Text variant="body" style={styles.featureTitle}>Small walks add up</Text>
                <Text variant="bodySmall">
                  Micro-walks throughout the day contribute to your health without the pressure of long workouts.
                </Text>
              </View>
            </View>

            <View style={styles.featureLast}>
              <View style={[styles.iconCircle, { backgroundColor: palette.bgSurfaceElevated }]}>
                <Text style={styles.iconEmoji}>{'\uD83D\uDD14'}</Text>
              </View>
              <View style={styles.featureText}>
                <Text variant="body" style={styles.featureTitle}>Smart reminders</Text>
                <Text variant="bodySmall">
                  Get gentle notifications at the right moments - never during class, meetings, or quiet hours.
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.howSection, { marginTop: whyToHowGap }]}>
            <TouchableOpacity
              onPress={() => setShowHowItWorks((prev) => !prev)}
              style={[
                styles.howCard,
                {
                  backgroundColor: palette.bgSurfaceElevated,
                  borderColor: palette.borderStrong,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text variant="body" style={styles.howLabel}>How it works</Text>
              <Animated.View
                style={[
                  styles.chevron,
                  {
                    transform: [{ rotate: chevronRotate }],
                    backgroundColor: palette.bgSurface,
                    borderColor: palette.borderSoft,
                    shadowColor: palette.shadow,
                  },
                ]}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path
                    d="M6 9l6 6 6-6"
                    stroke={palette.textMuted}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              </Animated.View>
            </TouchableOpacity>

            <Animated.View
              style={[
                styles.howDetailsWrap,
                {
                  height: detailsHeight,
                  opacity: detailsOpacity,
                  marginTop: detailsMarginTop,
                },
              ]}
              pointerEvents={showHowItWorks ? 'auto' : 'none'}
            >
              <Animated.View style={[styles.howDetailsInner, { transform: [{ translateY: detailsTranslateY }] }]}>
                <View
                  style={[
                    styles.howDetails,
                    {
                      backgroundColor: palette.bgSurface,
                      borderColor: palette.borderSoft,
                    },
                  ]}
                >
                  <View style={styles.step}>
                    <Text variant="body" style={styles.stepNumber}>1</Text>
                    <Text variant="bodySmall" style={styles.stepText}>
                      Add your weekly schedule or import a calendar file.
                    </Text>
                  </View>
                  <View style={styles.step}>
                    <Text variant="body" style={styles.stepNumber}>2</Text>
                    <Text variant="bodySmall" style={styles.stepText}>
                      GapWalk finds free gaps between your events.
                    </Text>
                  </View>
                  <View style={styles.step}>
                    <Text variant="body" style={styles.stepNumber}>3</Text>
                    <Text variant="bodySmall" style={styles.stepText}>
                      You get notified at the right moments for a quick walk.
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          </View>
        </View>

        <View style={[styles.bottom, { paddingTop: ctaTopGap }]}>
          {!isAuthenticated ? (
            <>
              <Button
                title="Log in"
                onPress={() => {
                  void runAuth('login');
                }}
                full
                loading={isAuthLoading}
                disabled={!authConfigured}
                testID="intro-auth-login"
              />
              <Button
                title="Sign up"
                onPress={() => {
                  void runAuth('signup');
                }}
                variant="secondary"
                full
                disabled={!authConfigured || isAuthLoading}
                testID="intro-auth-signup"
              />
            </>
          ) : (
            <Button
              title={hasSetPreferences ? 'Go to Dashboard' : 'Get Started'}
              onPress={handleCta}
              full
              testID="intro-get-started"
            />
          )}
          <Text variant="muted" style={styles.footer}>
            {isAuthenticated
              ? 'Welcome back. Continue your setup when you are ready.'
              : 'Use your account to continue. Login or sign up to get started.'}
          </Text>
        </View>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    paddingHorizontal: theme.layout.contentHorizontal,
  },
  topContent: {
    width: '100%',
  },
  headerFrame: {
    width: '100%',
    maxWidth: 370,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  headingGap: {
    letterSpacing: theme.letterSpacing?.heading ?? 0,
    fontSize: theme.fontSize.display,
    lineHeight: theme.fontSize.display + 6,
  },
  headingWalk: {
    letterSpacing: theme.letterSpacing?.heading ?? 0,
    fontSize: theme.fontSize.display,
    lineHeight: theme.fontSize.display + 6,
  },
  subtitle: {
    marginTop: theme.spacing.md,
    lineHeight: 22,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
    maxWidth: 356,
    alignSelf: 'center',
  },
  section: {
    width: '100%',
    maxWidth: 370,
    alignSelf: 'center',
  },
  sectionTitle: {
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  feature: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    alignItems: 'flex-start',
  },
  featureLast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  iconEmoji: {
    fontSize: 20,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.ms,
  },
  howSection: {
    width: '100%',
    maxWidth: 370,
    alignSelf: 'center',
  },
  howCard: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  howLabel: {
    fontWeight: theme.fontWeight.semibold,
  },
  howDetailsWrap: {
    overflow: 'hidden',
  },
  howDetailsInner: {
    flex: 1,
  },
  howDetails: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: 12,
    borderWidth: 1,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accentPrimary,
    color: theme.colors.bgApp,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
    marginRight: 12,
    overflow: 'hidden',
  },
  stepText: {
    flex: 1,
    lineHeight: 20,
    paddingTop: 2,
  },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bottom: {
    marginTop: 'auto',
  },
  footer: {
    textAlign: 'center',
    marginTop: 12,
  },
});
