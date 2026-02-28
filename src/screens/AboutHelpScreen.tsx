import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
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
import { ThemePalette, useThemePalette } from '../theme/palette';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'AboutHelp'>;

const contributors = [
  {
    name: 'Ehsan Mahmud Shishir',
    details: 'CS student at UCI, 2026',
    email: 'shishirmahmud100@gmail.com',
  },
  {
    name: 'Sadik Yamin',
    details: 'CS student at Truman State University, 2026',
    email: 'syam46484@gmail.com',
  },
];

const setupSteps = [
  'Bring in your schedule with a calendar file or enter it manually.',
  'Choose when you want reminders and when you want to be left alone.',
  'GapWalk scans your week for openings that fit your routine instead of interrupting it.',
  'Start a walk when you are ready and track your minutes, steps, and distance.',
];

const faqItems = [
  {
    question: 'What is an ICS file?',
    answer:
      'An ICS file is a standard calendar export used by Google Calendar, Apple Calendar, Outlook, and similar apps. Importing it lets GapWalk rebuild your weekly schedule for you instead of making you enter everything by hand.',
  },
  {
    question: 'Why does GapWalk ask for location?',
    answer:
      'Location is used for distance tracking during walks. If your device supports step counting, steps can still be tracked separately, but distance becomes less reliable without location access.',
  },
  {
    question: 'Can I use GapWalk without signing in?',
    answer:
      'Yes. You can use GapWalk locally without an account. Signing in only matters if you want your data synced across devices later.',
  },
  {
    question: 'What does no-excuses mode do?',
    answer:
      'No-excuses mode uses firmer reminders and a stricter tone, so the app pushes harder when you are close to skipping your goal.',
  },
];

const FaqAccordionItem: React.FC<{
  question: string;
  answer: string;
  isLast: boolean;
  palette: ThemePalette;
}> = ({ question, answer, isLast, palette }) => {
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (expanded) {
      setShowDetails(true);
    }

    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !expanded) {
        setShowDetails(false);
      }
    });
  }, [anim, expanded]);

  const chevronRotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const detailsOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const detailsTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  return (
    <View style={[styles.faqItem, !isLast && { borderBottomColor: palette.borderSoft, borderBottomWidth: 1 }]}>
      <Pressable
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.faqTrigger,
          pressed && { opacity: 0.82 },
        ]}
      >
        <View style={[styles.questionBadge, { backgroundColor: palette.accentMuted }]}>
          <Ionicons name="help" size={14} color={palette.accentPrimary} />
        </View>
        <View style={styles.questionBody}>
          <Text variant="body" style={styles.faqQuestion}>
            {question}
          </Text>
        </View>
        <Animated.View
          style={[
            styles.faqChevron,
            {
              transform: [{ rotate: chevronRotate }],
              backgroundColor: palette.bgSurface,
              borderColor: palette.borderSoft,
              shadowColor: palette.shadow,
            },
          ]}
        >
          <Ionicons name="chevron-down" size={15} color={palette.textMuted} />
        </Animated.View>
      </Pressable>

      {showDetails ? (
        <Animated.View
          style={[
            styles.faqDetailsWrap,
            {
              opacity: detailsOpacity,
              transform: [{ translateY: detailsTranslateY }],
            },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <Text variant="bodySmall" color={palette.textMuted} style={styles.faqAnswer}>
            {answer}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

export const AboutHelpScreen: React.FC<Props> = ({ navigation }) => {
  const palette = useThemePalette();
  const { themeMode } = useAppStore();

  const exitScreen = () => {
    navigation.navigate('Dashboard', { openMenu: true });
  };

  const openEmail = useCallback(async (email: string) => {
    const mailtoUrl = `mailto:${email}`;
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (!canOpen) throw new Error('unsupported');
      await Linking.openURL(mailtoUrl);
    } catch {
      if (Platform.OS === 'web' && typeof (globalThis as any).alert === 'function') {
        (globalThis as any).alert('Please copy the email address and contact us from your email app.');
        return;
      }
      Alert.alert(
        'Unable to open email',
        'Please copy the email address and contact us from your email app.'
      );
    }
  }, []);

  return (
    <Container scrollable>
      <View style={styles.content}>
        <ScreenHeader
          title="About & Help"
          subtitle="What GapWalk does, how to use it well, and how to reach the people behind it."
          onBack={exitScreen}
          backTestID="about-help-back"
          themeMode={themeMode}
        />

        <Card elevated style={styles.sectionCard}>
          <Text variant="body" style={styles.sectionTitle}>
            Why GapWalk exists
          </Text>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.paragraph}>
            GapWalk is built for people whose day already feels full. Instead of asking you to create extra workout time, it looks for short openings that already exist between classes, work, errands, and quiet hours.
          </Text>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.paragraphLast}>
            Set your schedule once, tune your walking preferences, and GapWalk turns free gaps into realistic walk opportunities you can actually follow.
          </Text>
        </Card>

        <Card elevated style={styles.sectionCard}>
          <Text variant="body" style={styles.sectionTitle}>
            How it works
          </Text>
          {setupSteps.map((step, index) => {
            const isLast = index === setupSteps.length - 1;
            return (
              <View
                key={step}
                style={[
                  styles.stepRow,
                  !isLast && { borderBottomColor: palette.borderSoft, borderBottomWidth: 1 },
                ]}
              >
                <View style={[styles.stepBadge, { backgroundColor: palette.accentMuted }]}>
                  <Text variant="bodySmall" style={[styles.stepBadgeText, { color: palette.accentPrimary }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text variant="bodySmall" color={palette.textMuted} style={styles.stepText}>
                  {step}
                </Text>
              </View>
            );
          })}
        </Card>

        <Card elevated style={styles.sectionCard}>
          <Text variant="body" style={styles.sectionTitle}>
            FAQ
          </Text>
          {faqItems.map((item, index) => {
            const isLast = index === faqItems.length - 1;
            return (
              <FaqAccordionItem
                key={item.question}
                question={item.question}
                answer={item.answer}
                isLast={isLast}
                palette={palette}
              />
            );
          })}
        </Card>

        <Card elevated style={styles.sectionCard}>
          <Text variant="body" style={styles.sectionTitle}>
            Contributors
          </Text>
          <Text variant="bodySmall" color={palette.textMuted} style={styles.contactIntro}>
            Questions, bug reports, or feedback worth sending? Reach the contributors directly.
          </Text>

          {contributors.map((contributor, index) => {
            const isLast = index === contributors.length - 1;
            return (
              <View
                key={contributor.email}
                style={[
                  styles.contributorRow,
                  !isLast && { borderBottomColor: palette.borderSoft, borderBottomWidth: 1 },
                ]}
              >
                <View style={styles.contributorTopRow}>
                  <View style={[styles.contributorIcon, { backgroundColor: palette.inputBg }]}>
                    <Ionicons name="person-outline" size={18} color={palette.accentPrimary} />
                  </View>
                  <View style={styles.contributorMeta}>
                    <Text variant="body" style={styles.contributorName}>
                      {contributor.name}
                    </Text>
                    <Text variant="bodySmall" color={palette.textMuted} style={styles.contributorDetails}>
                      {contributor.details}
                    </Text>
                    <Text variant="bodySmall" style={[styles.emailText, { color: palette.accentPrimary }]}>
                      {contributor.email}
                    </Text>
                  </View>
                </View>
                <Button
                  title="Email"
                  onPress={() => {
                    void openEmail(contributor.email);
                  }}
                  variant="outline"
                  style={[
                    styles.emailButton,
                    {
                      borderColor: palette.accentPrimary,
                      backgroundColor: palette.accentMuted,
                    },
                  ]}
                  textStyle={[styles.emailButtonText, { color: palette.accentPrimary }]}
                  testID={`about-help-email-${index + 1}`}
                />
              </View>
            );
          })}
        </Card>

        <TwoActionBar
          primaryAction={{
            title: 'Done',
            onPress: exitScreen,
            testID: 'about-help-done',
          }}
          style={styles.footerActions}
        />
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM,
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 12,
  },
  paragraph: {
    lineHeight: 20,
    marginBottom: 10,
  },
  paragraphLast: {
    lineHeight: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontWeight: theme.fontWeight.semibold,
  },
  stepText: {
    flex: 1,
    lineHeight: 20,
  },
  faqItem: {
    paddingVertical: 4,
  },
  faqTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  questionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  questionBody: {
    flex: 1,
  },
  faqQuestion: {
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 22,
  },
  faqAnswer: {
    lineHeight: 20,
    paddingLeft: 36,
    paddingRight: 4,
    paddingBottom: 12,
  },
  faqDetailsWrap: {
    overflow: 'hidden',
  },
  faqChevron: {
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
  contactIntro: {
    marginBottom: 10,
    lineHeight: 20,
  },
  contributorRow: {
    paddingVertical: 12,
  },
  contributorTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  contributorIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributorMeta: {
    flex: 1,
  },
  contributorName: {
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 2,
  },
  contributorDetails: {
    marginBottom: 2,
  },
  emailText: {
    fontWeight: theme.fontWeight.semibold,
  },
  emailButton: {
    alignSelf: 'flex-end',
    minWidth: 84,
    height: Math.round(theme.layout.buttonHeight * 0.7),
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  emailButtonText: {
    fontSize: 14,
  },
  footerActions: {
    paddingTop: screenChrome.FOOTER_PADDING_TOP,
  },
});
