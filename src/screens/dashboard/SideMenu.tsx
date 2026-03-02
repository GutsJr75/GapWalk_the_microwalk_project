import React, { useRef, useCallback } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { theme } from '../../theme';
import { useThemePalette } from '../../theme/palette';

export interface SideMenuItem {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
  testID: string;
}

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  menuItems: SideMenuItem[];
  onLogout: () => void;
  authUser: { email?: string; name?: string; sub?: string } | null;
  hasSetPreferences: boolean;
  menuPanelWidth: number;
  slideAnim: Animated.Value;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedMenuItem: React.FC<{
  item: SideMenuItem;
  isLast: boolean;
  palette: ReturnType<typeof useThemePalette>;
  onAction: (action: () => void) => void;
}> = ({ item, isLast, palette, onAction }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      tension: 150,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <AnimatedPressable
      style={[
        styles.menuItem,
        { borderBottomColor: isLast ? 'transparent' : palette.borderSoft },
        { transform: [{ scale: scaleAnim }] },
      ]}
      onPress={() => onAction(item.onPress)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{ color: 'rgba(46,233,166,0.12)' }}
      testID={item.testID}
    >
      <View style={styles.menuItemRow}>
        <AppIcon name={item.icon} size={17} color={palette.textPrimary} />
        <Text variant="body" style={styles.menuItemLabel}>
          {item.label}
        </Text>
        <AppIcon name="chevronRight" size={16} color={palette.textMuted} />
      </View>
    </AnimatedPressable>
  );
};

export const SideMenu: React.FC<SideMenuProps> = ({
  visible,
  onClose,
  menuItems,
  onLogout,
  authUser,
  hasSetPreferences,
  menuPanelWidth,
  slideAnim,
}) => {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();

  const runMenuAction = (action: () => void) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    action();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.content,
            {
              width: menuPanelWidth,
              marginTop: insets.top,
              marginBottom: insets.bottom,
              backgroundColor: palette.bgSurface,
              borderLeftColor: palette.borderSoft,
              transform: [
                {
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [menuPanelWidth + 24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: 28,
                paddingBottom: 34,
              },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View
              style={[
                styles.profileCard,
                { borderColor: palette.borderSoft, backgroundColor: palette.bgSurfaceElevated },
              ]}
            >
              <View style={[styles.profileAvatar, { backgroundColor: palette.accentMuted }]}>
                <Ionicons name="person" size={20} color={palette.accentPrimary} />
              </View>
              <View style={styles.profileMeta}>
                <Text variant="body" style={styles.profileName}>
                  {(authUser?.name && !authUser.name.includes('@')) ? authUser.name : 'GapWalker'}
                </Text>
                <Text variant="bodySmall" color={palette.textMuted}>
                  {authUser?.email ||
                    (hasSetPreferences
                      ? 'Onboarding complete'
                      : 'Complete setup to personalize')}
                </Text>
              </View>
            </View>

            <Text variant="bodySmall" style={[styles.sectionLabel, { color: palette.textMuted }]}>
              OPTIONS
            </Text>

            <View
              style={[
                styles.listCard,
                { borderColor: palette.borderSoft, backgroundColor: palette.bgSurfaceElevated },
              ]}
            >
              {menuItems.map((item, index) => {
                const isLast = index === menuItems.length - 1;
                return (
                  <AnimatedMenuItem
                    key={item.key}
                    item={item}
                    isLast={isLast}
                    palette={palette}
                    onAction={runMenuAction}
                  />
                );
              })}
            </View>

            <View style={styles.footer}>
              <Button
                title="Log out"
                onPress={onLogout}
                variant="outline"
                style={[
                  styles.logoutBtn,
                  { borderColor: theme.colors.danger, backgroundColor: 'rgba(239,68,68,0.08)' },
                ]}
                textStyle={[styles.logoutText, { color: theme.colors.danger }]}
                testID="dashboard-menu-logout"
              />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  content: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
    elevation: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  profileCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontWeight: theme.fontWeight.semibold,
  },
  sectionLabel: {
    marginBottom: 10,
    marginLeft: 2,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.8,
  },
  listCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    flex: 1,
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.md + 1,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  logoutBtn: {
    borderWidth: 1.5,
  },
  logoutText: {
    fontWeight: theme.fontWeight.semibold,
  },
});
