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
import { sessionsRepo } from '../data/repositories/sessionsRepo';
import { achievementsRepo, ACHIEVEMENTS, getAchievementDef, type UnlockedAchievement } from '../data/repositories/achievementsRepo';
import { calculateStreak, calculateWeeklyStats } from '../utils/statsUtils';
import { toUserFriendlyError } from '../utils/errorMessages';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

interface ProgressSnapshot {
  currentStreak: number;
  totalWalks: number;
  totalMinutes: number;
  activeDaysThisWeek: number;
}

const EMPTY_PROGRESS: ProgressSnapshot = {
  currentStreak: 0,
  totalWalks: 0,
  totalMinutes: 0,
  activeDaysThisWeek: 0,
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
  } = useAppStore();
  const palette = useThemePalette();
  const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);
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
    // Ignore auth name if it looks like an email address (Auth0 often sets name = email)
    if (authName && !authName.includes('@')) return authName;
    return 'GapWalker';
  }, [authUser?.name, profileDisplayName]);

  const hasCustomName = !!(profileDisplayName?.trim() ||
    (authUser?.name?.trim() && !authUser.name.includes('@')));

  const normalizedDraftName = normalizeDisplayName(draftName);
  const draftNameValidationError = validateDisplayName(normalizedDraftName);
  const hasNameChanged = normalizedDraftName !== resolvedDisplayName;
  const canSaveName = isEditingName && !savingName && !draftNameValidationError && hasNameChanged;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sessions, unlocked] = await Promise.all([
        sessionsRepo.getAll(),
        achievementsRepo.getAll(),
      ]);

      const streak = calculateStreak(sessions);
      const weeklyStats = calculateWeeklyStats(sessions);
      const totalMinutes = sessions.reduce((sum, session) => sum + Math.floor(session.activeSeconds / 60), 0);

      setProgress({
        currentStreak: streak.currentStreak,
        totalWalks: sessions.length,
        totalMinutes,
        activeDaysThisWeek: weeklyStats.daysActive,
      });
      setUnlockedAchievements(unlocked);
    } catch (error) {
      setProgress(EMPTY_PROGRESS);
      setUnlockedAchievements([]);
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

  const latestUnlocked = unlockedAchievements
    .map((item) => ({ ...item, def: getAchievementDef(item.id) }))
    .filter((item) => !!item.def)
    .slice(0, 3);

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
                  <Text variant="title" style={styles.heroName}>{resolvedDisplayName}</Text>
                  {authUser?.email ? (
                    <Text variant="bodySmall" color={palette.textMuted}>
                      {authUser.email.split('@')[0]}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <TextInput
                    value={draftName}
                    onChangeText={(value) => {
                      setDraftName(value);
                      if (nameError) setNameError(null);
                    }}
                    maxLength={32}
                    autoCapitalize="words"
                    autoCorrect={false}
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
                  {authUser?.email ? (
                    <Text variant="bodySmall" color={palette.textMuted}>
                      {authUser.email.split('@')[0]}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {isEditingName ? (
            <View style={styles.nameEditRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.nameActionBtn,
                  {
                    backgroundColor: palette.bgSurface,
                    borderColor: palette.borderStrong,
                  },
                  pressed && styles.nameActionBtnPressed,
                ]}
                onPress={handleCancelEditName}
                disabled={savingName}
                testID="profile-name-cancel"
              >
                <Text variant="bodySmall" style={{ color: palette.textPrimary }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.nameActionBtn,
                  {
                    backgroundColor: canSaveName ? palette.accentPrimary : palette.inputBg,
                    borderColor: canSaveName ? palette.accentPrimary : palette.borderStrong,
                  },
                  pressed && canSaveName && styles.nameActionBtnPressed,
                ]}
                onPress={() => { void handleSaveName(); }}
                disabled={!canSaveName}
                testID="profile-name-save"
              >
                <Text
                  variant="bodySmall"
                  style={{ color: canSaveName ? palette.accentOnSolid : palette.textMuted }}
                >
                  {savingName ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.updateNameBtn,
                {
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.bgSurface,
                },
                pressed && styles.nameActionBtnPressed,
              ]}
              onPress={handleStartEditName}
              testID="profile-name-update"
            >
              <Text variant="bodySmall" style={{ color: palette.textPrimary }}>
                {hasCustomName ? 'Change Username' : 'Set Username'}
              </Text>
            </Pressable>
          )}

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
              <View style={styles.statsGrid}>
                <View style={[styles.statItem, styles.statTile, { backgroundColor: palette.bgSurfaceElevated }]}>
                  <Ionicons name="flame-outline" size={18} color={palette.accentPrimary} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.accentPrimary }]}>{progress.currentStreak}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Streak</Text>
                </View>
                <View style={[styles.statItem, styles.statTile, { backgroundColor: palette.bgSurfaceElevated }]}>
                  <Ionicons name="walk-outline" size={18} color={palette.accentPrimary} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.accentPrimary }]}>{progress.totalWalks}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Walks</Text>
                </View>
                <View style={[styles.statItem, styles.statTile, { backgroundColor: palette.bgSurfaceElevated }]}>
                  <Ionicons name="time-outline" size={18} color={palette.accentPrimary} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.accentPrimary }]}>{progress.totalMinutes}</Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Minutes</Text>
                </View>
                <View style={[styles.statItem, styles.statTile, { backgroundColor: palette.bgSurfaceElevated }]}>
                  <Ionicons name="calendar-outline" size={18} color={palette.accentPrimary} style={styles.statIcon} />
                  <Text variant="title" style={[styles.statValue, { color: palette.accentPrimary }]}>
                    {progress.activeDaysThisWeek}
                    <Text style={styles.statDenominator}>/7</Text>
                  </Text>
                  <Text variant="bodySmall" color={palette.textMuted} style={styles.statLabel}>Active</Text>
                </View>
              </View>
            </Card>

            <Card elevated style={styles.card}>
              <View style={styles.sectionHeadRow}>
                <Text variant="body" style={styles.sectionTitle}>Achievements</Text>
                <Text variant="bodySmall" color={palette.textMuted}>
                  {unlockedAchievements.length}/{ACHIEVEMENTS.length}
                </Text>
              </View>

              {latestUnlocked.length === 0 ? (
                <Text variant="bodySmall" color={palette.textMuted}>No achievements unlocked yet.</Text>
              ) : (
                latestUnlocked.map((item) => (
                  <View key={item.id} style={styles.achievementRow}>
                    <View style={[styles.achievementIconWrap, { backgroundColor: palette.accentMuted }]}>
                      <Ionicons name={item.def!.icon as any} size={16} color={item.def!.color} />
                    </View>
                    <Text variant="bodySmall" style={styles.achievementTitle}>{item.def!.title}</Text>
                  </View>
                ))
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.viewAllBtn,
                  {
                    borderColor: palette.borderStrong,
                    backgroundColor: palette.bgSurface,
                  },
                  pressed && styles.nameActionBtnPressed,
                ]}
                onPress={() => navigation.navigate('Achievements', { source: 'profile' })}
                testID="profile-view-all-achievements"
              >
                <Text variant="bodySmall">View all</Text>
              </Pressable>
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
    marginBottom: 4,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'android' ? 6 : 8,
    fontSize: theme.fontSize.md,
    marginBottom: 6,
  },
  updateNameBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  nameEditRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  nameActionBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameActionBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 10,
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
  },
  statTile: {
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 4,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
  },
  statValue: {
    fontWeight: theme.fontWeight.bold,
    marginBottom: 3,
  },
  statDenominator: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  achievementIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementTitle: {
    fontWeight: theme.fontWeight.medium,
  },
  viewAllBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 6,
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
