import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
  Image,
  LayoutChangeEvent,
  ScrollView,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Modal as AppModal } from '../components/Modal';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { useThemePalette } from '../theme/palette';
import Svg, { Path } from 'react-native-svg';
import { analyticsService } from '../services/analytics';
import {
  firebaseAuthService,
  getFirebaseConfigurationError,
  getGoogleAuthConfigurationError,
  isFirebaseConfigured,
  isGoogleAuthConfigured,
  isGoogleSignInCancelled,
  requiresEmailVerification,
} from '../services/firebaseAuth';
import { toUserFriendlyError } from '../utils/errorMessages';

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

const HOW_DETAILS_GAP = 18;
const HOW_DETAILS_EXPAND_MARGIN_TOP = 12;
const HOW_DETAILS_FALLBACK_HEIGHT = 240;

type EmailAuthMode = 'login' | 'signup';
type VerificationPromptSource = EmailAuthMode | 'restore';

export const IntroScreen: React.FC<Props> = ({
  navigation,
  isAuthenticated = false,
  onAuthenticated,
}) => {
  const {
    authUser,
    hasSetPreferences,
    hasCompletedOnboarding,
    setAuthUser,
    themeMode,
  } = useAppStore();
  const palette = useThemePalette();
  const isDark = themeMode === 'dark';
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string } | null>(null);
  const showMessage = (title: string, message: string) => setMessageDialog({ title, message });
  const [authLoadingMode, setAuthLoadingMode] = useState<
    'login' | 'signup' | 'google' | 'reset' | 'resendVerification' | 'checkVerification' | null
  >(null);
  const [emailAuthMode, setEmailAuthMode] = useState<EmailAuthMode | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [authFormError, setAuthFormError] = useState<string | null>(null);
  const [verificationPrompt, setVerificationPrompt] = useState<{
    email: string;
    source: VerificationPromptSource;
  } | null>(null);
  const [verificationPromptError, setVerificationPromptError] = useState<string | null>(null);
  const [howDetailsMeasuredHeight, setHowDetailsMeasuredHeight] = useState(HOW_DETAILS_FALLBACK_HEIGHT);
  const howAnim = useRef(new Animated.Value(0)).current;
  const { height: viewportHeight } = useWindowDimensions();
  const authConfigured = isFirebaseConfigured();
  const googleAuthConfigured = isGoogleAuthConfigured();

  const verticalTopPadding = Math.round(viewportHeight * 0.072);
  const verticalBottomPadding = Math.round(viewportHeight * 0.09);
  const heroVerticalPadding = Math.max(theme.spacing.md, Math.round(viewportHeight * 0.02));
  const heroToHowGap = Math.max(theme.spacing.lg, Math.round(viewportHeight * 0.045));
  const ctaTopGap = Math.max(28, Math.round(viewportHeight * 0.045));

  useEffect(() => {
    Animated.timing(howAnim, {
      toValue: showHowItWorks ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showHowItWorks, howAnim]);

  useEffect(() => {
    if (isAuthenticated || !requiresEmailVerification(authUser) || !authUser?.email) {
      return;
    }
    setVerificationPrompt((current) =>
      current ?? {
        email: authUser.email!,
        source: 'restore',
      }
    );
  }, [authUser, isAuthenticated]);

  const resetEmailAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthPasswordConfirm('');
    setAuthFormError(null);
  };

  const openEmailAuthModal = (mode: EmailAuthMode) => {
    if (!authConfigured) {
      showMessage(
        'Firebase Authentication',
        getFirebaseConfigurationError() ??
          'Firebase Authentication is not configured.'
      );
      return;
    }
    setEmailAuthMode(mode);
    setAuthFormError(null);
    setAuthPassword('');
    setAuthPasswordConfirm('');
  };

  const closeEmailAuthModal = () => {
    setEmailAuthMode(null);
    setAuthFormError(null);
    setAuthPassword('');
    setAuthPasswordConfirm('');
  };

  const openVerificationPrompt = (
    email: string,
    source: VerificationPromptSource
  ) => {
    setVerificationPrompt({ email, source });
    setVerificationPromptError(null);
  };

  const dismissVerificationPrompt = async () => {
    setVerificationPrompt(null);
    setVerificationPromptError(null);
    await firebaseAuthService.signOut();
    setAuthUser(null);
  };

  const validateEmail = (email: string): string | null => {
    const normalized = email.trim();
    if (!normalized) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return 'Enter a valid email address.';
    }
    return null;
  };

  const runEmailAuth = async () => {
    if (!emailAuthMode) return;

    const emailError = validateEmail(authEmail);
    if (emailError) {
      setAuthFormError(emailError);
      return;
    }
    if (!authPassword) {
      setAuthFormError('Password is required.');
      return;
    }
    if (emailAuthMode === 'signup') {
      if (authPassword.length < 6) {
        setAuthFormError('Password must be at least 6 characters.');
        return;
      }
      if (authPassword !== authPasswordConfirm) {
        setAuthFormError('Passwords do not match.');
        return;
      }
    }

    setAuthFormError(null);
    setAuthLoadingMode(emailAuthMode);
    try {
      const user =
        emailAuthMode === 'signup'
          ? await firebaseAuthService.signUpWithEmail(authEmail, authPassword)
          : await firebaseAuthService.signInWithEmail(authEmail, authPassword);
      setAuthUser(user);
      if (requiresEmailVerification(user)) {
        closeEmailAuthModal();
        resetEmailAuthForm();
        openVerificationPrompt(user.email ?? authEmail.trim(), emailAuthMode);
        return;
      }
      closeEmailAuthModal();
      resetEmailAuthForm();
      onAuthenticated?.();
    } catch (error) {
      setAuthFormError(toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

  const handlePasswordReset = async () => {
    const emailError = validateEmail(authEmail);
    if (emailError) {
      setAuthFormError(emailError);
      return;
    }

    setAuthFormError(null);
    setAuthLoadingMode('reset');
    try {
      await firebaseAuthService.sendPasswordReset(authEmail);
      showMessage(
        'Reset email sent',
        'If that account exists, Firebase has sent a password reset email.'
      );
    } catch (error) {
      setAuthFormError(toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

  const runGoogleAuth = async () => {
    if (!googleAuthConfigured) {
      showMessage(
        'Google Sign-In',
        getGoogleAuthConfigurationError() ??
          'Google sign-in is not configured.'
      );
      return;
    }

    setAuthLoadingMode('google');
    try {
      const user = await firebaseAuthService.signInWithGoogle();
      setAuthUser(user);
      onAuthenticated?.();
    } catch (error) {
      if (isGoogleSignInCancelled(error)) {
        setAuthLoadingMode(null);
        return;
      }
      showMessage('Sign-in Failed', toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

  const handleResendVerificationEmail = async () => {
    if (!verificationPrompt?.email) return;

    setVerificationPromptError(null);
    setAuthLoadingMode('resendVerification');
    try {
      await firebaseAuthService.sendCurrentUserVerificationEmail();
      showMessage(
        'Verification email sent',
        `We sent another verification email to ${verificationPrompt.email}.`
      );
    } catch (error) {
      setVerificationPromptError(toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

  const handleCheckVerification = async () => {
    setVerificationPromptError(null);
    setAuthLoadingMode('checkVerification');
    try {
      const refreshedUser = await firebaseAuthService.refreshCurrentUser();
      setAuthUser(refreshedUser);
      if (!refreshedUser) {
        setVerificationPromptError('Your session expired. Please log in again.');
        return;
      }
      if (requiresEmailVerification(refreshedUser)) {
        setVerificationPromptError('Your email is not verified yet. Open the link in your inbox, then try again.');
        return;
      }
      setVerificationPrompt(null);
      resetEmailAuthForm();
      onAuthenticated?.();
    } catch (error) {
      setVerificationPromptError(toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

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

  // Keep lift stable while details are measured so the capsule never appears to drop on expand.
  const stableDetailsHeightForLift = Math.max(howDetailsMeasuredHeight, HOW_DETAILS_FALLBACK_HEIGHT);
  const howExpandedLift = Math.min(
    Math.round(stableDetailsHeightForLift * 0.2),
    Math.round(viewportHeight * 0.08),
  );

  const howStackTranslateY = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -howExpandedLift],
  });

  const collapsedHowSectionDownShift = Math.round(ctaTopGap * 4.2);
  const howSectionTranslateY = howAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedHowSectionDownShift, 0],
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

  return (
    <Container entranceAnimated={false}>
      <View style={[styles.screen, { paddingTop: verticalTopPadding, paddingBottom: Math.round(verticalBottomPadding * 0.01) }]}>
        <Animated.View style={[styles.heroHowStack, { transform: [{ translateY: howStackTranslateY }] }]}>
          <View style={styles.topSection}>
            <View style={[styles.headerFrame, { paddingVertical: heroVerticalPadding }]}>
              <View style={styles.headingRow}>
                <Text variant="heading" style={[styles.headingGap, { color: palette.textPrimary }]}>Gap</Text>
                <Text variant="heading" style={[styles.headingWalk, { color: palette.textMuted }]}>Walk</Text>
              </View>
              <Text variant="body" style={styles.subtitle}>
                Busy schedule? No time to exercise? Turn your daily schedule gaps into short, realistic walks.
              </Text>
            </View>
          </View>

          <View style={styles.middleSection}>
          <Animated.View style={[styles.howSection, { marginTop: heroToHowGap, transform: [{ translateY: howSectionTranslateY }] }]}>
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
            </Animated.View>
          </View>
        </Animated.View>

          <View style={styles.bottomSection}>
            {!isAuthenticated ? (
              <>
                <Button
                  title="Continue with Google"
                  onPress={() => void runGoogleAuth()}
                  variant="primary"
                  loading={authLoadingMode === 'google'}
                  disabled={!googleAuthConfigured || authLoadingMode === 'login' || authLoadingMode === 'signup' || authLoadingMode === 'reset'}
                  testID="intro-auth-google"
                  full
                />
                <View style={styles.authButtonRow}>
                  <Button
                    title="Sign up"
                    onPress={() => openEmailAuthModal('signup')}
                    variant="secondary"
                    loading={authLoadingMode === 'signup'}
                    disabled={!authConfigured || authLoadingMode === 'login' || authLoadingMode === 'google' || authLoadingMode === 'reset'}
                    testID="intro-auth-signup"
                    style={styles.authButtonHalf}
                  />
                  <Button
                    title="Log in"
                    onPress={() => openEmailAuthModal('login')}
                    loading={authLoadingMode === 'login'}
                    disabled={!authConfigured || authLoadingMode === 'signup' || authLoadingMode === 'google' || authLoadingMode === 'reset'}
                    testID="intro-auth-login"
                    style={styles.authButtonHalf}
                  />
                </View>
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
      <AppModal visible={messageDialog !== null} onClose={() => setMessageDialog(null)} title={messageDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{messageDialog?.message}</Text>
          <Button title="OK" onPress={() => setMessageDialog(null)} />
        </View>
      </AppModal>
      <AppModal
        visible={emailAuthMode !== null}
        onClose={closeEmailAuthModal}
        title={emailAuthMode === 'signup' ? 'Create account' : 'Log in'}
      >
        <View style={styles.authModalBody}>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.authModalCopy}>
            {emailAuthMode === 'signup'
              ? 'Create your GapWalk account with your email and password.'
              : 'Log in with the email and password linked to your GapWalk account.'}
          </Text>
          <TextInput
            value={authEmail}
            onChangeText={(value) => {
              setAuthEmail(value);
              if (authFormError) setAuthFormError(null);
            }}
            placeholder="Email"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            style={[
              styles.authInput,
              {
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
                borderColor: palette.borderStrong,
              },
            ]}
          />
          <TextInput
            value={authPassword}
            onChangeText={(value) => {
              setAuthPassword(value);
              if (authFormError) setAuthFormError(null);
            }}
            placeholder="Password"
            placeholderTextColor={palette.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.authInput,
              {
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
                borderColor: palette.borderStrong,
              },
            ]}
          />
          {emailAuthMode === 'signup' ? (
            <TextInput
              value={authPasswordConfirm}
              onChangeText={(value) => {
                setAuthPasswordConfirm(value);
                if (authFormError) setAuthFormError(null);
              }}
              placeholder="Confirm password"
              placeholderTextColor={palette.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.authInput,
                {
                  color: palette.textPrimary,
                  backgroundColor: palette.inputBg,
                  borderColor: palette.borderStrong,
                },
              ]}
            />
          ) : null}
          {authFormError ? (
            <Text variant="bodySmall" style={[styles.authErrorText, { color: theme.colors.danger }]}>
              {authFormError}
            </Text>
          ) : null}
          <Button
            title={emailAuthMode === 'signup' ? 'Create account' : 'Log in'}
            onPress={() => void runEmailAuth()}
            loading={authLoadingMode === emailAuthMode}
            full
          />
          {emailAuthMode === 'login' ? (
            <Button
              title="Forgot Password"
              onPress={() => void handlePasswordReset()}
              variant="muted"
              loading={authLoadingMode === 'reset'}
              full
            />
          ) : null}
        </View>
      </AppModal>
      <AppModal
        visible={verificationPrompt !== null}
        onClose={() => void dismissVerificationPrompt()}
        title="Verify your email"
      >
        <View style={styles.authModalBody}>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.authModalCopy}>
            {verificationPrompt?.source === 'signup'
              ? `We sent a verification email to ${verificationPrompt.email}. Verify your email before using your GapWalk account.`
              : `This GapWalk account still needs email verification. Open the link we sent to ${verificationPrompt?.email}, then come back here.`}
          </Text>
          {verificationPromptError ? (
            <Text variant="bodySmall" style={[styles.authErrorText, { color: theme.colors.danger }]}>
              {verificationPromptError}
            </Text>
          ) : null}
          <Button
            title="I've verified my email"
            onPress={() => void handleCheckVerification()}
            loading={authLoadingMode === 'checkVerification'}
            full
          />
          <Button
            title="Resend verification email"
            onPress={() => void handleResendVerificationEmail()}
            variant="secondary"
            loading={authLoadingMode === 'resendVerification'}
            full
          />
          <Button
            title="Use different email"
            onPress={() => void dismissVerificationPrompt()}
            variant="muted"
            full
          />
        </View>
      </AppModal>
    </Container>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    paddingHorizontal: theme.layout.contentHorizontal,
  },
  heroHowStack: {
    flex: 7,
  },
  topSection: {
    flex: 3,
    justifyContent: 'center',
  },
  middleSection: {
    flex: 4,
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  bottomSection: {
    flex: 2,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  headerFrame: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.sm,
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
    alignSelf: 'center',
  },
  howSection: {
    width: '100%',
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
  authButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  authButtonHalf: {
    flex: 1,
  },
  authModalBody: {
    gap: 12,
    paddingBottom: 8,
  },
  authModalCopy: {
    textAlign: 'center',
    lineHeight: 20,
  },
  authInput: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: theme.fontSize.md,
  },
  authErrorText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  guestBtn: {
    marginTop: 16,
  },
  guestBtnText: {
    letterSpacing: 0.2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  footer: {
    textAlign: 'center',
    marginTop: 10,
  },
});
