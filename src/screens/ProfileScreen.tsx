import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Platform, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { BrandWalkIcon } from '../components/BrandWalkIcon';
import { ScreenState } from '../components/ScreenState';
import { ScreenHeader } from '../components/ScreenHeader';
import { SuccessToast } from '../components/SuccessToast';
import { Modal as AppModal } from '../components/Modal';
import { TwoActionBar } from '../components/TwoActionBar';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { authStorage } from '../data/authStorage';
import {
  firebaseAuthService,
  getFirebaseConfigurationError,
  getGoogleAuthConfigurationError,
  isFirebaseConfigured,
  isGoogleAuthConfigured,
  isGoogleSignInCancelled,
  requiresEmailVerification,
} from '../services/firebaseAuth';
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { registerCurrentDeviceForNotifications } from '../services/deviceRegistration';
import { wipeLocalPersonalData } from '../services/localDataWipe';

import { calculateStreak, calculateWeeklyStats } from '../utils/statsUtils';
import { toUserFriendlyError } from '../utils/errorMessages';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

interface ProgressSnapshot {
  currentStreak: number;
  totalWalks: number;
  totalMinutes: number;
  activeDaysThisWeek: number;
  totalDistance: number;
  longestWalkMinutes: number;
  avgWalkMinutes: number;
  longestStreak: number;
  firstWalkDate: string | null;
}

const EMPTY_PROGRESS: ProgressSnapshot = {
  currentStreak: 0,
  totalWalks: 0,
  totalMinutes: 0,
  activeDaysThisWeek: 0,
  totalDistance: 0,
  longestWalkMinutes: 0,
  avgWalkMinutes: 0,
  longestStreak: 0,
  firstWalkDate: null,
};

const formatDistance = (meters: number, unit: 'km' | 'mi'): string => {
  if (unit === 'km') return `${(meters / 1000).toFixed(1)} km`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
};

const normalizeDisplayName = (value: string): string => value.trim().replace(/\s+/g, ' ');

const validateDisplayName = (value: string): string | null => {
  if (!value) return 'Name must be 2 to 32 characters.';
  if (value.length < 2 || value.length > 32) return 'Name must be 2 to 32 characters.';
  return null;
};

type EmailAuthMode = 'login' | 'signup';

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode,
    authUser,
    profileDisplayName,
    setProfileDisplayName,
    isAuthenticated,
    setHasCompletedOnboarding,
    setHasSetPreferences,
    setPreferences,
    setScheduleSource,
    setTodayStats,
    setTodaySteps,
    setUpcomingPlans,
    setIsAuthenticated,
    setAuthUser,
    distanceUnit,
  } = useAppStore();
  const palette = useThemePalette();
  const { width: windowWidth } = useWindowDimensions();
  const compactProfile = windowWidth < 400;
  const narrowAllTime = windowWidth < 360;
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string } | null>(null);
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
    source: EmailAuthMode;
  } | null>(null);
  const [verificationPromptError, setVerificationPromptError] = useState<string | null>(null);
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void } | null>(null);
  const authConfigured = isFirebaseConfigured();
  const googleAuthConfigured = isGoogleAuthConfigured();
  const isPasswordAccount = authUser?.providerId === 'password';
  const showMessage = (title: string, message: string) => setMessageDialog({ title, message });
  const showBinaryConfirm = (title: string, message: string, confirmText: string, onConfirm: () => void) => setConfirmDialog({ title, message, confirmText, onConfirm });

  const resolvedDisplayName = useMemo(() => {
    const localName = profileDisplayName?.trim();
    if (localName) return localName;
    const authName = authUser?.name?.trim();
    // Ignore provider names that are just an email address.
    if (authName && !authName.includes('@')) return authName;
    return 'GapWalker';
  }, [authUser?.name, profileDisplayName]);

  const walkingSince = useMemo(() => {
    if (!progress.firstWalkDate) return null;
    const d = new Date(progress.firstWalkDate);
    return `Walking since ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  }, [progress.firstWalkDate]);

  const normalizedDraftName = normalizeDisplayName(draftName);
  const draftNameValidationError = validateDisplayName(normalizedDraftName);
  const hasNameChanged = normalizedDraftName !== resolvedDisplayName;
  const canSaveName = isEditingName && !savingName && !draftNameValidationError && hasNameChanged;

  const resetEmailAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthPasswordConfirm('');
    setAuthFormError(null);
  };

  const completeAuthentication = () => {
    setIsAuthenticated(true);
    void registerCurrentDeviceForNotifications();
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

  const validateEmail = (email: string): string | null => {
    const normalized = email.trim();
    if (!normalized) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return 'Enter a valid email address.';
    }
    return null;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sessions = await sessionsRepo.getAll();

      const streak = calculateStreak(sessions);
      const weeklyStats = calculateWeeklyStats(sessions);
      const totalMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.activeSeconds / 60), 0);
      const totalDistance = sessions.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
      const longestWalkMinutes = sessions.reduce((max, s) => Math.max(max, Math.floor(s.activeSeconds / 60)), 0);
      const avgWalkMinutes = sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0;

      const sorted = [...sessions].sort((a, b) => a.start.localeCompare(b.start));
      const firstWalkDate = sorted.length > 0 ? sorted[0].start : null;

      setProgress({
        currentStreak: streak.currentStreak,
        totalWalks: sessions.length,
        totalMinutes,
        activeDaysThisWeek: weeklyStats.daysActive,
        totalDistance,
        longestWalkMinutes,
        avgWalkMinutes,
        longestStreak: streak.longestStreak,
        firstWalkDate,
      });
    } catch (error) {
      setProgress(EMPTY_PROGRESS);
      setLoadError(toUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isEditingName) {
        setDraftName(resolvedDisplayName);
        setNameError(null);
      }
      void load();
    }, [isEditingName, load, resolvedDisplayName]),
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  const handleStartEditName = () => {
    setDraftName(resolvedDisplayName);
    setNameError(null);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setDraftName(resolvedDisplayName);
    setNameError(null);
    setIsEditingName(false);
  };

  const handleSaveName = async () => {
    const validationError = validateDisplayName(normalizedDraftName);
    if (validationError) {
      setNameError(validationError);
      return;
    }
    if (!hasNameChanged) {
      setIsEditingName(false);
      return;
    }

    try {
      setSavingName(true);
      await authStorage.saveProfileDisplayName(normalizedDraftName);
      setProfileDisplayName(normalizedDraftName);
      setIsEditingName(false);
      setNameError(null);
      setShowSaveToast(true);
    } catch (error) {
      setNameError(toUserFriendlyError(error));
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = () => {
    const doLogout = async () => {
      await firebaseAuthService.signOut();
      await wipeLocalPersonalData();
      await authStorage.clearAll();
      setHasCompletedOnboarding(false);
      setHasSetPreferences(false);
      setPreferences(null);
      setScheduleSource(null);
      setTodayStats(0, 0, 0);
      setTodaySteps(0);
      setUpcomingPlans([]);
      setIsAuthenticated(false);
      setAuthUser(null);
      navigation.navigate('Intro');
    };

    if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
      const ok = (globalThis as any).confirm('Are you sure you want to log out?');
      if (ok) void doLogout();
      return;
    }

    showBinaryConfirm('Log out', 'Are you sure you want to log out?', 'Log out', () => void doLogout());
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
        setVerificationPrompt({ email: user.email ?? authEmail.trim(), source: emailAuthMode });
        return;
      }
      closeEmailAuthModal();
      resetEmailAuthForm();
      completeAuthentication();
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
      completeAuthentication();
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
      completeAuthentication();
    } catch (error) {
      setVerificationPromptError(toUserFriendlyError(error));
    } finally {
      setAuthLoadingMode(null);
    }
  };

  const dismissVerificationPrompt = async () => {
    setVerificationPrompt(null);
    setVerificationPromptError(null);
    try {
      await firebaseAuthService.signOut();
    } catch (error) {
      showMessage('Sign-out Failed', toUserFriendlyError(error));
    } finally {
      setAuthUser(null);
      setIsAuthenticated(false);
    }
  };

  const openChangePasswordModal = () => {
    if (!isPasswordAccount) {
      showMessage(
        'Password managed by provider',
        'You signed in with Google. Change your password in your Google account settings.'
      );
      return;
    }
    setCurrentPassword('');
    setNextPassword('');
    setConfirmNextPassword('');
    setChangePasswordError(null);
    setChangePasswordModalVisible(true);
  };

  const closeChangePasswordModal = () => {
    setChangePasswordModalVisible(false);
    setChangePasswordError(null);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmNextPassword('');
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      setChangePasswordError('Current password is required.');
      return;
    }
    if (!nextPassword) {
      setChangePasswordError('New password is required.');
      return;
    }
    if (nextPassword.length < 6) {
      setChangePasswordError('Password must be at least 6 characters.');
      return;
    }
    if (nextPassword !== confirmNextPassword) {
      setChangePasswordError('New passwords do not match.');
      return;
    }
    if (currentPassword === nextPassword) {
      setChangePasswordError('Use a different password than your current one.');
      return;
    }

    setChangePasswordError(null);
    setChangingPassword(true);
    try {
      await firebaseAuthService.changePassword(currentPassword, nextPassword);
      closeChangePasswordModal();
      showMessage('Password updated', 'Your password has been changed successfully.');
    } catch (error) {
      setChangePasswordError(toUserFriendlyError(error));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Profile"
          subtitle="Your progress and profile details in one place."
          onBack={handleBack}
          themeMode={themeMode}
        />

        <Card elevated style={styles.card}>
          <View style={[styles.heroRow, compactProfile && styles.heroRowCompact]}>
            <View style={[styles.heroAvatar, compactProfile && styles.heroAvatarCompact, { backgroundColor: palette.accentMuted }]}>
              {resolvedDisplayName && resolvedDisplayName !== 'GapWalker' ? (
                <Text variant="title" style={[styles.avatarInitials, compactProfile && styles.avatarInitialsCompact, { color: palette.accentPrimary }]}>
                  {resolvedDisplayName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0].toUpperCase())
                    .join('')}
                </Text>
              ) : (
                <Ionicons name="person" size={compactProfile ? 28 : 34} color={palette.accentPrimary} />
              )}
            </View>
            <View style={styles.heroInfo}>
              {!isEditingName ? (
                <>
                  <View style={[styles.nameRow, compactProfile && styles.nameRowCompact]}>
                    <Text variant="title" style={[styles.heroName, compactProfile && styles.heroNameCompact]}>{resolvedDisplayName}</Text>
                    <Pressable
                      onPress={handleStartEditName}
                      hitSlop={10}
                      testID="profile-name-update"
                      style={({ pressed }) => pressed && styles.editIconPressed}
                    >
                      <Ionicons name="create-outline" size={16} color={palette.textMuted} />
                    </Pressable>
                  </View>
                  {authUser?.email ? (
                    <Text variant="bodySmall" color={palette.textMuted} style={styles.emailLine}>
                      {authUser.email}
                    </Text>
                  ) : null}
                  {walkingSince ? (
                    <Text variant="bodySmall" color={palette.textMuted} style={styles.walkingSince}>
                      {walkingSince}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={[styles.nameEditInlineRow, compactProfile && styles.nameEditInlineRowCompact]}>
                    <TextInput
                      value={draftName}
                      onChangeText={(value) => {
                        setDraftName(value);
                        if (nameError) setNameError(null);
                      }}
                      maxLength={32}
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoFocus
                      editable={!savingName}
                      style={[
                        styles.nameInput,
                        {
                          color: palette.textPrimary,
                          backgroundColor: palette.inputBg,
                          borderColor: palette.borderStrong,
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() => { void handleSaveName(); }}
                      disabled={!canSaveName}
                      hitSlop={8}
                      testID="profile-name-save"
                      style={styles.nameInlineIcon}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={canSaveName ? palette.accentPrimary : palette.textMuted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={handleCancelEditName}
                      disabled={savingName}
                      hitSlop={8}
                      testID="profile-name-cancel"
                      style={styles.nameInlineIcon}
                    >
                      <Ionicons name="close-circle" size={22} color={palette.textMuted} />
                    </Pressable>
                  </View>
                  {authUser?.email ? (
                    <Text variant="bodySmall" color={palette.textMuted} style={styles.emailLine}>
                      {authUser.email}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {(nameError || (isEditingName && draftNameValidationError)) ? (
            <Text variant="bodySmall" style={styles.nameError}>
              {nameError || draftNameValidationError}
            </Text>
          ) : null}
        </Card>

        {loading ? (
          <ScreenState variant="loading" title="Loading profile…" />
        ) : loadError ? (
          <ScreenState
            variant="error"
            title="Could not load profile"
            subtitle={loadError}
            onRetry={() => void load()}
          />
        ) : (
          <>
            <Card elevated style={styles.card}>
              <Text variant="body" style={styles.sectionTitle}>Progress Snapshot</Text>
              <View style={[styles.statsRow, compactProfile && styles.statsRowCompact]}>
                <View style={[styles.statColumn, compactProfile && styles.statColumnCompact]}>
                  <Ionicons name="flame-outline" size={16} color={palette.trendDown} style={styles.statIcon} />
                  <View style={[styles.statValueGroup, compactProfile && styles.statValueGroupCompact]}>
                    <Text variant="title" style={[styles.statValue, compactProfile && styles.statValueCompact, { color: palette.trendDown }]}>
                      {progress.currentStreak}
                    </Text>
                  </View>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Streak</Text>
                </View>
                <View style={[styles.statColumn, compactProfile && styles.statColumnCompact]}>
                  <BrandWalkIcon size={16} color={palette.accentPrimary} style={styles.statIcon} />
                  <View style={[styles.statValueGroup, compactProfile && styles.statValueGroupCompact]}>
                    <Text variant="title" style={[styles.statValue, compactProfile && styles.statValueCompact, { color: palette.accentPrimary }]}>
                      {progress.totalWalks}
                    </Text>
                  </View>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Walks</Text>
                </View>
                <View style={[styles.statColumn, compactProfile && styles.statColumnCompact]}>
                  <Ionicons name="time-outline" size={16} color={palette.info} style={styles.statIcon} />
                  <View style={[styles.statValueGroup, compactProfile && styles.statValueGroupCompact]}>
                    <Text variant="title" style={[styles.statValue, compactProfile && styles.statValueCompact, { color: palette.info }]}>
                      {progress.totalMinutes}
                    </Text>
                  </View>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Minutes</Text>
                </View>
                <View style={[styles.statColumn, compactProfile && styles.statColumnCompact]}>
                  <Ionicons name="calendar-outline" size={16} color={palette.success} style={styles.statIcon} />
                  <View
                    style={[
                      styles.statValueGroup,
                      styles.statValueGroupFraction,
                      compactProfile && styles.statValueGroupCompact,
                    ]}
                  >
                    <Text variant="title" style={[styles.statValue, compactProfile && styles.statValueCompact, { color: palette.success }]}>
                      {progress.activeDaysThisWeek}
                    </Text>
                    <Text style={[styles.statDenominator, compactProfile && styles.statDenominatorCompact, { color: palette.success }]}>/7</Text>
                  </View>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Active</Text>
                </View>
              </View>
            </Card>

            <Card elevated style={styles.card}>
              <View style={styles.allTimeHeader}>
                <Ionicons name="trophy-outline" size={18} color={palette.accentPrimary} />
                <Text variant="body" style={styles.allTimeTitle}>All Time</Text>
              </View>
              <View style={styles.allTimeGrid}>
                <View style={[styles.allTimeItem, narrowAllTime && styles.allTimeItemFull]}>
                  <Text variant="bodySmall" color={palette.textMuted}>Distance</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.info }]}>
                    {formatDistance(progress.totalDistance, distanceUnit)}
                  </Text>
                </View>
                <View style={[styles.allTimeItem, narrowAllTime && styles.allTimeItemFull]}>
                  <Text variant="bodySmall" color={palette.textMuted}>Longest Walk</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.accentPrimary }]}>
                    {progress.longestWalkMinutes} min
                  </Text>
                </View>
                <View style={[styles.allTimeItem, narrowAllTime && styles.allTimeItemFull]}>
                  <Text variant="bodySmall" color={palette.textMuted}>Avg Walk</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.trendDown }]}>
                    {progress.avgWalkMinutes} min
                  </Text>
                </View>
                <View style={[styles.allTimeItem, narrowAllTime && styles.allTimeItemFull]}>
                  <Text variant="bodySmall" color={palette.textMuted}>Best Streak</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.success }]}>
                    {progress.longestStreak} {progress.longestStreak === 1 ? 'day' : 'days'}
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}
      </View>

      {isAuthenticated ? (
        <View style={styles.footer}>
          <TwoActionBar
            secondaryAction={{
              title: 'Change password',
              onPress: openChangePasswordModal,
              variant: 'secondary',
              testID: 'profile-change-password',
            }}
            primaryAction={{
              title: 'Log out',
              onPress: handleLogout,
              variant: 'danger',
              testID: 'profile-logout',
            }}
          />
        </View>
      ) : (
        <View style={styles.footer}>
          <Card elevated>
            <Text variant="body" style={styles.sectionTitle}>Save your progress</Text>
            <Text variant="bodySmall" color={palette.textMuted} style={styles.guestAuthCopy}>
              Create an account to sync your walks and keep your progress safe.
            </Text>
            <Button
              title="Continue with Google"
              onPress={() => { void runGoogleAuth(); }}
              variant="primary"
              loading={authLoadingMode === 'google'}
              disabled={!googleAuthConfigured || authLoadingMode === 'login' || authLoadingMode === 'signup' || authLoadingMode === 'reset'}
              testID="profile-auth-google"
              full
            />
            <View style={styles.authButtonRow}>
              <Button
                title="Sign up"
                onPress={() => openEmailAuthModal('signup')}
                variant="secondary"
                loading={authLoadingMode === 'signup'}
                disabled={!authConfigured || authLoadingMode === 'login' || authLoadingMode === 'google' || authLoadingMode === 'reset'}
                testID="profile-auth-signup"
                style={styles.authButtonHalf}
              />
              <Button
                title="Log in"
                onPress={() => openEmailAuthModal('login')}
                loading={authLoadingMode === 'login'}
                disabled={!authConfigured || authLoadingMode === 'signup' || authLoadingMode === 'google' || authLoadingMode === 'reset'}
                testID="profile-auth-login"
                style={styles.authButtonHalf}
              />
            </View>
          </Card>
        </View>
      )}
      <SuccessToast
        visible={showSaveToast}
        message="Profile updated"
        onDismiss={() => setShowSaveToast(false)}
      />
      <AppModal visible={messageDialog !== null} onClose={() => setMessageDialog(null)} title={messageDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{messageDialog?.message}</Text>
          <Button title="OK" onPress={() => setMessageDialog(null)} />
        </View>
      </AppModal>
      <AppModal visible={confirmDialog !== null} onClose={() => setConfirmDialog(null)} title={confirmDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{confirmDialog?.message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmDialog(null)} style={{ flex: 1 }} />
            <Button title={confirmDialog?.confirmText ?? 'Yes'} variant="danger" onPress={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }} style={{ flex: 1 }} />
          </View>
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
          <View style={styles.authModalFieldStack}>
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
          </View>
          {authFormError ? (
            <Text variant="bodySmall" style={styles.authErrorText}>
              {authFormError}
            </Text>
          ) : null}
          {emailAuthMode === 'login' ? (
            <Pressable
              onPress={() => { void handlePasswordReset(); }}
              disabled={authLoadingMode === 'reset' || authLoadingMode === 'login'}
              style={({ pressed }) => [styles.authLinkButton, pressed && styles.editIconPressed]}
            >
              <Text variant="bodySmall" style={[styles.authLinkText, { color: palette.accentPrimary }]}>
                Forgot password?
              </Text>
            </Pressable>
          ) : null}
          <Button
            title={emailAuthMode === 'signup' ? 'Create account' : 'Log in'}
            onPress={() => { void runEmailAuth(); }}
            loading={authLoadingMode === emailAuthMode}
            disabled={authLoadingMode === 'google' || authLoadingMode === 'reset'}
            full
            style={styles.authModalActionButton}
          />
        </View>
      </AppModal>
      <AppModal
        visible={verificationPrompt !== null}
        onClose={() => { void dismissVerificationPrompt(); }}
        title="Verify your email"
      >
        <View style={styles.authModalBody}>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.authModalCopy}>
            {`We sent a verification email to ${verificationPrompt?.email ?? 'your inbox'}. Open the link, then return here.`}
          </Text>
          {verificationPromptError ? (
            <Text variant="bodySmall" style={styles.authErrorText}>
              {verificationPromptError}
            </Text>
          ) : null}
          <View style={styles.verificationActions}>
            <Button
              title="Resend email"
              variant="secondary"
              onPress={() => { void handleResendVerificationEmail(); }}
              loading={authLoadingMode === 'resendVerification'}
              disabled={authLoadingMode === 'checkVerification'}
              style={styles.verificationActionButton}
            />
            <Button
              title="I verified"
              onPress={() => { void handleCheckVerification(); }}
              loading={authLoadingMode === 'checkVerification'}
              disabled={authLoadingMode === 'resendVerification'}
              style={styles.verificationActionButton}
            />
          </View>
          <Button
            title={verificationPrompt?.source === 'signup' ? 'Use another email' : 'Back'}
            variant="muted"
            onPress={() => { void dismissVerificationPrompt(); }}
            full
            style={styles.verificationDismissButton}
          />
        </View>
      </AppModal>
      <AppModal
        visible={changePasswordModalVisible}
        onClose={closeChangePasswordModal}
        title="Change password"
      >
        <View style={styles.authModalBody}>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.authModalCopy}>
            Enter your current password, then choose a new one.
          </Text>
          <View style={styles.authModalFieldStack}>
            <TextInput
              value={currentPassword}
              onChangeText={(value) => {
                setCurrentPassword(value);
                if (changePasswordError) setChangePasswordError(null);
              }}
              placeholder="Current password"
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
            <TextInput
              value={nextPassword}
              onChangeText={(value) => {
                setNextPassword(value);
                if (changePasswordError) setChangePasswordError(null);
              }}
              placeholder="New password"
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
            <TextInput
              value={confirmNextPassword}
              onChangeText={(value) => {
                setConfirmNextPassword(value);
                if (changePasswordError) setChangePasswordError(null);
              }}
              placeholder="Confirm new password"
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
          </View>
          {changePasswordError ? (
            <Text variant="bodySmall" style={styles.authErrorText}>
              {changePasswordError}
            </Text>
          ) : null}
          <Button
            title="Update password"
            onPress={() => { void handleChangePassword(); }}
            loading={changingPassword}
            disabled={changingPassword}
            full
            style={styles.authModalActionButton}
          />
        </View>
      </AppModal>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  card: {
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroRowCompact: {
    alignItems: 'flex-start',
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarInitials: {
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.xl,
  },
  avatarInitialsCompact: {
    fontSize: theme.fontSize.lg,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 1,
  },
  heroNameCompact: {
    fontSize: theme.fontSize.md + 2,
    lineHeight: theme.fontSize.md + 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  nameRowCompact: {
    alignItems: 'flex-start',
  },
  editIconPressed: {
    opacity: 0.5,
  },
  walkingSince: {
    marginTop: 4,
  },
  emailLine: {
    marginTop: 2,
    flexShrink: 1,
  },
  nameEditInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  nameEditInlineRowCompact: {
    flexWrap: 'wrap',
    rowGap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'android' ? 4 : 6,
    fontSize: theme.fontSize.md,
  },
  nameInlineIcon: {
    padding: 2,
  },
  nameError: {
    color: theme.colors.error,
    marginTop: 8,
  },
  errorTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 6,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  sectionTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 12,
  },
  guestAuthCopy: {
    marginBottom: 12,
  },
  authButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  authButtonHalf: {
    flex: 1,
  },
  authModalBody: {
    paddingBottom: 8,
  },
  authModalCopy: {
    textAlign: 'center',
    marginBottom: 14,
  },
  authModalFieldStack: {
    gap: 10,
  },
  authInput: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 7 : 9,
    fontSize: theme.fontSize.md,
  },
  authErrorText: {
    color: theme.colors.error,
    marginTop: 10,
  },
  authLinkButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  authLinkText: {
    fontWeight: theme.fontWeight.semibold,
  },
  authModalActionButton: {
    marginTop: 14,
  },
  verificationActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  verificationActionButton: {
    flex: 1,
  },
  verificationDismissButton: {
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
  },
  statsRowCompact: {
    flexWrap: 'wrap',
    rowGap: 14,
    justifyContent: 'space-between',
  },
  statColumn: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  statColumnCompact: {
    flex: 0,
    width: '47%',
    maxWidth: '48%',
    minWidth: '44%',
  },
  statIcon: {
    marginBottom: 2,
  },
  statValueGroup: {
    minHeight: 34,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 2,
  },
  statValueGroupCompact: {
    minHeight: 30,
  },
  statValueGroupFraction: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
  },
  statValue: {
    fontWeight: theme.fontWeight.bold,
    lineHeight: 30,
    includeFontPadding: false,
    textAlign: 'center',
  },
  statValueCompact: {
    fontSize: theme.fontSize.lg,
    lineHeight: 26,
  },
  statDenominator: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 22,
    includeFontPadding: false,
    marginLeft: 1,
    paddingBottom: Platform.OS === 'android' ? 1 : 0,
  },
  statDenominatorCompact: {
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  allTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  allTimeTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  allTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  allTimeItem: {
    width: '50%',
    paddingRight: 8,
  },
  allTimeItemFull: {
    width: '100%',
    paddingRight: 0,
  },
  allTimeValue: {
    fontWeight: theme.fontWeight.semibold,
    marginTop: 2,
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
});
