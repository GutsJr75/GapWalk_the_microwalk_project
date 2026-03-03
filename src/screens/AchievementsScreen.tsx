import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components/Card';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { TwoActionBar } from '../components/TwoActionBar';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { translateLiteral } from '../i18n';
import { toUserFriendlyError } from '../utils/errorMessages';
import { guidanceStorage } from '../data/guidanceStorage';
import {
  ACHIEVEMENTS,
  achievementsRepo,
  type AchievementDef,
  type AchievementId,
  type UnlockedAchievement,
} from '../data/repositories/achievementsRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'Achievements'>;

const formatUnlockedDate = (iso: string, language: 'en' | 'es'): string => {
  const asDate = new Date(iso);
  if (Number.isNaN(asDate.getTime())) return iso;
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  return asDate.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const AchievementsScreen: React.FC<Props> = ({ navigation, route }) => {
  const palette = useThemePalette();
  const { themeMode, language, guidanceSeen, setGuidanceSeen } = useAppStore();
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dismissHint = useCallback(() => {
    setGuidanceSeen('achievements_hint', true);
    void guidanceStorage.markSeen('achievements_hint');
  }, [setGuidanceSeen]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const unlocked = await achievementsRepo.getAll();
      setUnlockedAchievements(unlocked);
    } catch (error) {
      setUnlockedAchievements([]);
      setLoadError(toUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unlockedIdSet = useMemo(
    () => new Set(unlockedAchievements.map((item) => item.id)),
    [unlockedAchievements],
  );

  const unlockedAtById = useMemo(() => {
    const result = new Map<AchievementId, string>();
    unlockedAchievements.forEach((item) => {
      result.set(item.id, item.unlockedAt);
    });
    return result;
  }, [unlockedAchievements]);

  const unlockedDefs = useMemo(
    () => ACHIEVEMENTS.filter((item) => unlockedIdSet.has(item.id)),
    [unlockedIdSet],
  );

  const lockedDefs = useMemo(
    () => ACHIEVEMENTS.filter((item) => !unlockedIdSet.has(item.id)),
    [unlockedIdSet],
  );

  const unlockedPrefix = translateLiteral('Unlocked', language);

  const exitScreen = () => {
    if (route.params?.source === 'profile') {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Profile');
      }
      return;
    }
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const renderSection = (
    title: string,
    items: AchievementDef[],
    state: 'unlocked' | 'locked',
    testID: string,
  ) => (
    <Card elevated style={styles.sectionCard} testID={testID}>
      <View style={styles.sectionHeader}>
        <Text variant="body" style={styles.sectionTitle}>
          {title}
        </Text>
        <View style={[styles.countPill, { backgroundColor: palette.inputBg }]}>
          <Text variant="bodySmall" style={[styles.countText, { color: palette.textMuted }]}>
            {items.length}
          </Text>
        </View>
      </View>

      {items.length === 0 ? (
        <Text variant="bodySmall" style={[styles.emptySectionText, { color: palette.textMuted }]}>
          {state === 'unlocked' ? 'No unlocked achievements yet.' : 'No locked achievements left.'}
        </Text>
      ) : (
        items.map((item, index) => {
          const isLast = index === items.length - 1;
          const unlockedAt = unlockedAtById.get(item.id);
          const isUnlocked = state === 'unlocked';
          const rowTitleColor = isUnlocked ? palette.textPrimary : palette.textMuted;
          const rowDescColor = isUnlocked ? palette.textMuted : palette.textMuted;

          return (
            <View
              key={item.id}
              style={[
                styles.row,
                !isLast && { borderBottomColor: palette.borderSoft, borderBottomWidth: 1 },
                !isUnlocked && styles.lockedRow,
              ]}
            >
              <View
                style={[
                  styles.badgeCircle,
                  {
                    borderColor: isUnlocked ? item.color : palette.textMuted,
                    backgroundColor: isUnlocked ? palette.accentMuted : palette.inputBg,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={isUnlocked ? item.color : palette.textMuted}
                />
              </View>

              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}>
                  <Text variant="body" style={[styles.rowTitle, { color: rowTitleColor }]}>
                    {item.title}
                  </Text>
                  {!isUnlocked ? (
                    <View
                      style={[
                        styles.lockedChip,
                        {
                          borderColor: palette.borderStrong,
                          backgroundColor: palette.inputBg,
                        },
                      ]}
                    >
                      <Text variant="bodySmall" style={[styles.lockedChipText, { color: palette.textMuted }]}>
                        Locked
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text variant="bodySmall" style={[styles.rowDescription, { color: rowDescColor }]}>
                  {item.description}
                </Text>

                {isUnlocked && unlockedAt ? (
                  <Text variant="bodySmall" style={[styles.unlockedMeta, { color: palette.accentPrimary }]}>
                    {`${unlockedPrefix} ${formatUnlockedDate(unlockedAt, language)}`}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Achievements"
          subtitle="See all badges and what you need to do to unlock each one."
          onBack={exitScreen}
          backTestID="achievements-back"
          themeMode={themeMode}
        />

        {!guidanceSeen.achievements_hint && (
          <Card elevated style={styles.hintCard}>
            <Ionicons name="trophy-outline" size={20} color={palette.accentPrimary} />
            <Text variant="bodySmall" color={palette.textMuted} style={styles.hintText}>
              Earn badges by walking consistently. Your first badge is just one walk away!
            </Text>
            <Button title="Got it" onPress={dismissHint} variant="outline" style={styles.hintDismiss} />
          </Card>
        )}

        <Card elevated style={styles.summaryCard}>
          <View style={styles.summaryTitleRow}>
            <Text variant="body" style={styles.summaryTitle}>
              Achievements
            </Text>
            <Text variant="bodySmall" style={[styles.summaryCount, { color: palette.textMuted }]}>
              {unlockedDefs.length}/{ACHIEVEMENTS.length}
            </Text>
          </View>
          <Text variant="bodySmall" style={[styles.summarySub, { color: palette.textMuted }]}>
            Unlocked and locked achievements are listed below.
          </Text>
        </Card>

        {loading ? (
          <Card elevated style={styles.statusCard}>
            <Text variant="body" style={styles.statusTitle}>
              Loading achievements...
            </Text>
          </Card>
        ) : loadError ? (
          <Card elevated style={styles.statusCard}>
            <Text variant="body" style={styles.statusTitle}>
              Could not load achievements
            </Text>
            <Text variant="bodySmall" style={[styles.statusBody, { color: palette.textMuted }]}>
              {loadError}
            </Text>
            <Button title="Try again" onPress={() => void load()} variant="outline" style={styles.retryBtn} />
          </Card>
        ) : (
          <>
            {renderSection('Unlocked', unlockedDefs, 'unlocked', 'achievements-section-unlocked')}
            {renderSection('Locked', lockedDefs, 'locked', 'achievements-section-locked')}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <TwoActionBar
          primaryAction={{
            title: 'Done',
            onPress: exitScreen,
            testID: 'achievements-done',
          }}
        />
      </View>
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
  hintCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hintText: {
    flex: 1,
    lineHeight: 20,
  },
  hintDismiss: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  summaryCard: {
    marginBottom: 16,
  },
  summaryTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryCount: {
    fontWeight: theme.fontWeight.semibold,
  },
  summarySub: {
    marginTop: 6,
  },
  sectionCard: {
    marginBottom: 14,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  countPill: {
    minWidth: 30,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontWeight: theme.fontWeight.semibold,
  },
  emptySectionText: {
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  lockedRow: {
    opacity: 0.76,
  },
  badgeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  rowTitle: {
    flex: 1,
    fontWeight: theme.fontWeight.semibold,
  },
  rowDescription: {
    lineHeight: 19,
  },
  unlockedMeta: {
    marginTop: 6,
    fontWeight: theme.fontWeight.medium,
  },
  lockedChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  lockedChipText: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
  },
  statusCard: {
    marginBottom: 14,
  },
  statusTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 6,
  },
  statusBody: {
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 12,
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
