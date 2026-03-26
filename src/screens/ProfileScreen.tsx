import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Platform, Pressable, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
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
import { firebaseAuthService } from '../services/firebaseAuth';
import { sessionsRepo } from '../data/repositories/sessionsRepo';

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

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode,
    authUser,
    profileDisplayName,
    setProfileDisplayName,
    isAuthenticated,
    setIsAuthenticated,
    setAuthUser,
    distanceUnit,
  } = useAppStore();
  const palette = useThemePalette();
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void } | null>(null);
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
      await authStorage.clearAll();
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
          <View style={styles.heroRow}>
            <View style={[styles.heroAvatar, { backgroundColor: palette.accentMuted }]}>
              {resolvedDisplayName && resolvedDisplayName !== 'GapWalker' ? (
                <Text variant="title" style={[styles.avatarInitials, { color: palette.accentPrimary }]}>
                  {resolvedDisplayName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0].toUpperCase())
                    .join('')}
                </Text>
              ) : (
                <Ionicons name="person" size={34} color={palette.accentPrimary} />
              )}
            </View>
            <View style={styles.heroInfo}>
              {!isEditingName ? (
                <>
                  <View style={styles.nameRow}>
                    <Text variant="title" style={styles.heroName}>{resolvedDisplayName}</Text>
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
                    <Text variant="bodySmall" color={palette.textMuted}>
                      {authUser.email.split('@')[0]}
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
                  <View style={styles.nameEditInlineRow}>
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
                    <Text variant="bodySmall" color={palette.textMuted}>
                      {authUser.email.split('@')[0]}
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
              <View style={styles.statsRow}>
                <View style={styles.statColumn}>
                  <Ionicons name="flame-outline" size={16} color={palette.trendDown} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.trendDown }]}>{progress.currentStreak}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Streak</Text>
                </View>
                <View style={styles.statColumn}>
                  <Ionicons name="walk-outline" size={16} color={palette.accentPrimary} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.accentPrimary }]}>{progress.totalWalks}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Walks</Text>
                </View>
                <View style={styles.statColumn}>
                  <Ionicons name="time-outline" size={16} color={palette.info} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.info }]}>{progress.totalMinutes}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Minutes</Text>
                </View>
                <View style={styles.statColumn}>
                  <Ionicons name="calendar-outline" size={16} color={palette.success} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.success }]}>
                    {progress.activeDaysThisWeek}
                    <Text style={[styles.statDenominator, { color: palette.success }]}>/7</Text>
                  </Text>
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
                <View style={styles.allTimeItem}>
                  <Text variant="bodySmall" color={palette.textMuted}>Distance</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.info }]}>
                    {formatDistance(progress.totalDistance, distanceUnit)}
                  </Text>
                </View>
                <View style={styles.allTimeItem}>
                  <Text variant="bodySmall" color={palette.textMuted}>Longest Walk</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.accentPrimary }]}>
                    {progress.longestWalkMinutes} min
                  </Text>
                </View>
                <View style={styles.allTimeItem}>
                  <Text variant="bodySmall" color={palette.textMuted}>Avg Walk</Text>
                  <Text variant="body" style={[styles.allTimeValue, { color: palette.trendDown }]}>
                    {progress.avgWalkMinutes} min
                  </Text>
                </View>
                <View style={styles.allTimeItem}>
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
            primaryAction={{
              title: 'Log out',
              onPress: handleLogout,
              variant: 'danger',
              testID: 'profile-logout',
            }}
          />
        </View>
      ) : null}
      <SuccessToast
        visible={showSaveToast}
        message="Profile updated"
        onDismiss={() => setShowSaveToast(false)}
      />
      <AppModal visible={confirmDialog !== null} onClose={() => setConfirmDialog(null)} title={confirmDialog?.title ?? ''}>
        <View style={{ paddingBottom: 8 }}>
          <Text variant="body" style={{ color: palette.textMuted, textAlign: 'center', marginBottom: 24 }}>{confirmDialog?.message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmDialog(null)} style={{ flex: 1 }} />
            <Button title={confirmDialog?.confirmText ?? 'Yes'} variant="danger" onPress={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }} style={{ flex: 1 }} />
          </View>
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
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.xl,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontWeight: theme.fontWeight.semibold,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  editIconPressed: {
    opacity: 0.5,
  },
  walkingSince: {
    marginTop: 4,
  },
  nameEditInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statColumn: {
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 2,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
  },
  statValue: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
  },
  statDenominator: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
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
  },
  allTimeValue: {
    fontWeight: theme.fontWeight.semibold,
    marginTop: 2,
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
