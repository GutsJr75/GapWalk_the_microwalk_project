import React from 'react';
import { View, StyleSheet, ViewStyle, ScrollView, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useThemePalette } from '../theme/palette';

interface ContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  safeArea?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  scrollable = false,
  safeArea = true,
}) => {
  const Wrapper = safeArea ? SafeAreaView : View;
  const Content = scrollable ? ScrollView : View;
  const palette = useThemePalette();

  return (
    <Wrapper style={[styles.safeArea, { backgroundColor: palette.bgApp }, style]}>
      <Content
        style={scrollable ? styles.scrollView : styles.view}
        contentContainerStyle={scrollable ? styles.scrollContent : undefined}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Content>
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bgApp,
  },
  view: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

