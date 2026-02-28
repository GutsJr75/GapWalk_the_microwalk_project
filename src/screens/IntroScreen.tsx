import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet, TouchableOpacity, Animated, Easing, Pressable, useWindowDimensions, Image, LayoutChangeEvent } from 'react-native';
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
import { analyticsService } from '../services/analytics';
import { getAuth0Discovery, getAuth0RequestConfig, isAuth0Configured } from '../services/auth0';
import { authStorage } from '../data/authStorage';

WebBrowser.maybeCompleteAuthSession();

const BRAND_MARK_SOURCE = require('../../assets/icons/brand-mark.png');
const BRAND_TILE_DARK = '#071a2e';
const BRAND_TILE_LIGHT = '#edf1f7';
const BRAND_MARK_DARK = '#2ee9a6';
const BRAND_MARK_LIGHT = '#047857';

const LogoTile: React.FC<{ size: number; isDark: boolean }> = ({ size, isDark }) => {
  const markSize = Math.round(size * 0.44);
  return (
    <View
      style={[
        styles.logoTile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.21),
          backgroundColor: isDark ? BRAND_TILE_DARK : BRAND_TILE_LIGHT,
          borderColor: isDark ? 'rgba(46,233,166,0.24)' : 'rgba(15,23,42,0.14)',
          shadowColor: isDark ? BRAND_MARK_DARK : '#0f172a',
          shadowOpacity: isDark ? 0.24 : 0.14,
          shadowRadius: isDark ? 12 : 8,
          elevation: isDark ? 5 : 3,
        },
      ]}
    >
      <Image
        source={BRAND_MARK_SOURCE}
        style={[
          styles.logoMark,
          {
            width: markSize,
            height: markSize,
            tintColor: isDark ? BRAND_MARK_DARK : BRAND_MARK_LIGHT,
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
};

interface Props extends NativeStackScreenProps<RootStackParamList, 'Intro'> {
  isAuthenticated?: boolean;
  onAuthenticated?: () => void;
}

const AUTH_DIVIDER_MARGIN_Y = 18;
const AUTH_SECONDARY_BLOCK_GAP = 28;
const AUTH_GUEST_BLOCK_GAP = 32;
const AUTH_FOOTER_MARGIN_TOP = 24;
const HOW_DETAILS_GAP = 18;
const HOW_DETAILS_EXPAND_MARGIN_TOP = 14;
const HOW_DETAILS_FALLBACK_HEIGHT = 240;

export const IntroScreen: React.FC<Props> = ({
  navigation,
  isAuthenticated = false,
  onAuthenticated,
}) => {
  const { hasSetPreferences, hasCompletedOnboarding, setAuthUser, themeMode } = useAppStore();
  const palette = useThemePalette();
  const isDark = themeMode === 'dark';
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [authLoadingMode, setAuthLoadingMode] = useState<'login' | 'signup' | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [howDetailsMeasuredHeight, setHowDetailsMeasuredHeight] = useState(HOW_DETAILS_FALLBACK_HEIGHT);
  const howAnim = useRef(new Animated.Value(0)).current;
  const handledAuthResponseRef = useRef<string | null>(null);
  const { height: viewportHeight } = useWindowDimensions();
  const authConfigured = isAuth0Configured();
  const discovery = getAuth0Discovery();

  const verticalTopPadding = Math.round(viewportHeight * 0.072);
  const verticalBottomPadding = Math.round(viewportHeight * 0.09);
  const heroVerticalPadding = Math.max(theme.spacing.md, Math.round(viewportHeight * 0.02));
  const heroToWhyGap = Math.max(theme.spacing.xl, Math.round(viewportHeight * 0.055));
  const whyToHowGap = Math.max(theme.spacing.lg, Math.round(viewportHeight * 0.045));
  const ctaTopGap = Math.max(28, Math.round(viewportHeight * 0.045));
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

  const exchangeAndStoreToken = async (code: string, request: AuthSession.AuthRequest | null) => {
    if (!discovery?.tokenEndpoint || !request) return;
    try {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          code,
          clientId: request.clientId,
          redirectUri: request.redirectUri,
          extraParams: request.codeVerifier
            ? { code_verifier: request.codeVerifier }
            : {},
        },
        { tokenEndpoint: discovery.tokenEndpoint }
      );

      if (tokenResponse.idToken) {
        try {
          const parts = tokenResponse.idToken.split('.');
          const payload = JSON.parse(atob(parts[1]));
          const user = {
            email: payload.email as string | undefined,
            name: payload.name as string | undefined,
            sub: payload.sub as string | undefined,
          };
          setAuthUser(user);
          if (rememberMe) {
            await authStorage.saveUser(user);
          }
        } catch {
          // ID token decode failed — non-critical
        }
      }

      if (rememberMe) {
        await authStorage.saveToken(tokenResponse.accessToken);
        await authStorage.setRememberMe(true);
      }
    } catch (e) {
      if (__DEV__) console.warn('Token exchange failed:', e);
    }
  };

  const handleAuthResponse = (
    response: AuthSession.AuthSessionResult | null,
    request: AuthSession.AuthRequest | null,
    key: string,
  ) => {
    if (!response) return;

    const responseKey =
      `${key}:` + (response.type === 'success'
        ? `success:${response.params.code ?? ''}`
        : `other:${response.type}`);
    if (handledAuthResponseRef.current === responseKey) return;
    handledAuthResponseRef.current = responseKey;

    if (response.type === 'success') {
      const code = response.params.code;
      if (code) {
        void exchangeAndStoreToken(code, request);
      }
      setAuthLoadingMode(null);
      onAuthenticated?.();
      return;
    }

    if (response.type === 'dismiss' || response.type === 'cancel') {
      setAuthLoadingMode(null);
      return;
    }

    setAuthLoadingMode(null);
    const details =
      response.type === 'error'
        ? response.error?.message ?? 'Please try again.'
        : 'Please try again.';
    Alert.alert('Login failed', details);
  };

  useEffect(() => {
    handleAuthResponse(loginResponse, loginRequest, 'login');
  }, [loginResponse]);

  useEffect(() => {
    handleAuthResponse(signupResponse, signupRequest, 'signup');
  }, [signupResponse]);

  const chevronRotate = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const detailsHeight = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, howDetailsMeasuredHeight],
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
    outputRange: [0, HOW_DETAILS_EXPAND_MARGIN_TOP],
  });

  const handleHowDetailsLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight <= 0) return;
    if (Math.abs(nextHeight - howDetailsMeasuredHeight) <= 1) return;
    setHowDetailsMeasuredHeight(nextHeight);
  };

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

  const handleContinueAsGuest = () => {
    analyticsService.track('continue_as_guest');
    if (hasCompletedOnboarding) {
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

    setAuthLoadingMode(mode);
    try {
      const prompt = mode === 'login' ? promptLogin : promptSignup;
      await prompt();
    } catch (error) {
      setAuthLoadingMode(null);
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Login failed', message);
    }
  };

  return (
    <Container scrollable entranceAnimated={false} resetScrollOnMount>
      <View style={[styles.introLayout, { minHeight: viewportHeight }]}>
        <View
          style={[
            styles.screen,
            {
              minHeight: viewportHeight,
              paddingTop: verticalTopPadding,
              paddingBottom: verticalBottomPadding,
            },
          ]}
        >
          <View style={styles.topContent}>
            <View style={[styles.headerFrame, { paddingVertical: heroVerticalPadding }]}>
              <View style={styles.logoRow}>
                <LogoTile size={75} isDark={isDark} />
              </View>
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
                    onLayout={handleHowDetailsLayout}
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
                  onPress={() => void runAuth('login')}
                  full
                  loading={authLoadingMode === 'login'}
                  disabled={!authConfigured || authLoadingMode === 'signup'}
                  testID="intro-auth-login"
                />
                <View style={styles.authDivider}>
                  <View style={[styles.dividerLine, { backgroundColor: palette.borderStrong }]} />
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.dividerText}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: palette.borderStrong }]} />
                </View>
                <Button
                  title="Sign up"
                  onPress={() => void runAuth('signup')}
                  variant="secondary"
                  full
                  loading={authLoadingMode === 'signup'}
                  disabled={!authConfigured || authLoadingMode === 'login'}
                  testID="intro-auth-signup"
                />
                <Pressable
                  onPress={() => setRememberMe((prev) => !prev)}
                  style={styles.rememberRow}
                  hitSlop={8}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: palette.borderStrong },
                      rememberMe && { backgroundColor: palette.accentPrimary, borderColor: palette.accentPrimary },
                    ]}
                  >
                    {rememberMe && (
                      <Svg width={12} height={12} viewBox="0 0 24 24">
                        <Path
                          d="M5 13l4 4L19 7"
                          stroke="#06261d"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    )}
                  </View>
                  <Text variant="bodySmall" style={styles.rememberLabel}>Remember me</Text>
                </Pressable>
                <Button
                  title="Continue as Guest"
                  onPress={handleContinueAsGuest}
                  variant="muted"
                  full
                  style={styles.guestBtn}
                  textStyle={[
                    styles.guestBtnText,
                    {
                      color: palette.accentPrimary,
                      textShadowColor: 'rgba(46,233,166,0.55)',
                    },
                  ]}
                  testID="intro-guest"
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
                : 'Your health and privacy are our utmost priority.'}
            </Text>
          </View>
        </View>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  introLayout: {
    position: 'relative',
  },
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
  logoRow: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    marginTop: -4,
  },
  logoTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  logoMark: {
    opacity: 1,
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
    paddingRight: 3,
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
    gap: HOW_DETAILS_GAP,
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
    lineHeight: 21,
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
  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: AUTH_DIVIDER_MARGIN_Y,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: theme.spacing.md,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AUTH_SECONDARY_BLOCK_GAP,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberLabel: {
    marginLeft: 8,
  },
  guestBtn: {
    marginTop: AUTH_GUEST_BLOCK_GAP,
  },
  guestBtnText: {
    letterSpacing: 0.2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  footer: {
    textAlign: 'center',
    marginTop: AUTH_FOOTER_MARGIN_TOP,
  },
});
