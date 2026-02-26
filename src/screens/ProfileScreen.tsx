import React from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { TwoActionBar } from '../components/TwoActionBar';
import { theme } from '../theme';
import { screenChrome } from '../theme/screenChrome';
import { useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';
import { authStorage } from '../lib/authStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const {
    themeMode,
    authUser,
    isAuthenticated,
    setIsAuthenticated,
    setAuthUser,
    hasCompletedOnboarding,
    hasSetPreferences,
  } = useAppStore();
  const palette = useThemePalette();

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

    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void doLogout() },
    ]);
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="Profile"
          subtitle="Your account details and progress."
          onBack={() => navigation.navigate('Dashboard')}
          themeMode={themeMode}
        />

        <Card elevated style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: palette.accentMuted }]}>
              <Ionicons name="person" size={28} color={palette.accentPrimary} />
            </View>
            <View style={styles.userInfo}>
              <Text variant="body" style={styles.userName}>
                {authUser?.name || 'GapWalker'}
              </Text>
              <Text variant="bodySmall" color={palette.textMuted}>
                {authUser?.email || 'No email linked'}
              </Text>
            </View>
          </View>
        </Card>

        <Card elevated style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={palette.accentPrimary} />
            <Text variant="bodySmall" style={[styles.label, { color: palette.textMuted }]}>
              Account Status
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text variant="bodySmall">Authentication</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: isAuthenticated ? palette.accentMuted : palette.inputBg },
              ]}
            >
              <Text
                variant="bodySmall"
                style={{
                  color: isAuthenticated ? palette.accentPrimary : palette.textMuted,
                  fontWeight: theme.fontWeight.medium,
                }}
              >
                {isAuthenticated ? 'Signed in' : 'Guest'}
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text variant="bodySmall">Onboarding</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: hasCompletedOnboarding ? palette.accentMuted : palette.inputBg },
              ]}
            >
              <Text
                variant="bodySmall"
                style={{
                  color: hasCompletedOnboarding ? palette.accentPrimary : palette.textMuted,
                  fontWeight: theme.fontWeight.medium,
                }}
              >
                {hasCompletedOnboarding ? 'Complete' : 'In progress'}
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text variant="bodySmall">Preferences</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: hasSetPreferences ? palette.accentMuted : palette.inputBg },
              ]}
            >
              <Text
                variant="bodySmall"
                style={{
                  color: hasSetPreferences ? palette.accentPrimary : palette.textMuted,
                  fontWeight: theme.fontWeight.medium,
                }}
              >
                {hasSetPreferences ? 'Configured' : 'Not set'}
              </Text>
            </View>
          </View>
        </Card>
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
  card: { marginBottom: 20 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontWeight: theme.fontWeight.semibold, marginBottom: 2 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  label: { marginBottom: 0 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
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
