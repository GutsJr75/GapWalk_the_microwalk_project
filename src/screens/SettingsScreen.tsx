import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { Container } from '../components/Container';
import { Text } from '../components/Text';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { themeMode, setThemeMode, language, setLanguage } = useAppStore();

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  };

  return (
    <Container scrollable>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text variant="bodySmall" style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text variant="title" style={styles.title}>Settings</Text>
        <Text variant="muted" style={styles.sub}>Tweak how GapWalk looks and speaks.</Text>

        <Card elevated style={styles.card}>
          <Text variant="bodySmall" style={styles.label}>Appearance</Text>
          <View style={styles.row}>
            <Button
              title="Dark"
              onPress={() => setThemeMode('dark')}
              variant={themeMode === 'dark' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
            <Button
              title="Light"
              onPress={() => setThemeMode('light')}
              variant={themeMode === 'light' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
          </View>
        </Card>

        <Card elevated style={styles.card}>
          <Text variant="bodySmall" style={styles.label}>Language</Text>
          <View style={styles.row}>
            <Button
              title="English"
              onPress={() => setLanguage('en')}
              variant={language === 'en' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
            <Button
              title={"Espa\u00F1ol"}
              onPress={() => setLanguage('es')}
              variant={language === 'es' ? 'primary' : 'secondary'}
              style={styles.pill}
            />
          </View>
        </Card>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.contentHorizontal,
    paddingTop: 26,
    alignSelf: 'center',
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
  },
  topRow: { width: '100%', marginBottom: theme.spacing.sm, alignItems: 'flex-start' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 2, marginLeft: -32 },
  backText: { color: theme.colors.textMuted, fontWeight: theme.fontWeight.semibold },
  title: { marginBottom: 4, textAlign: 'center', fontSize: theme.fontSize.xl + 2 },
  sub: { marginBottom: 20, textAlign: 'center' },
  card: { marginBottom: 16 },
  label: { color: theme.colors.textMuted, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1 },
});


