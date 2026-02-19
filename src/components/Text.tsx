import React from 'react';
import { Text as RNText, StyleSheet, TextStyle, Platform, StyleProp } from 'react-native';
import { theme } from '../theme';
import { useAppStore } from '../store';
import { getThemePalette } from '../theme/palette';
import { AppLanguage, translateLiteral } from '../lib/i18n';

interface TextProps {
  children: React.ReactNode;
  variant?: 'heading' | 'title' | 'body' | 'bodySmall' | 'muted' | 'nav';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

const mapThemeTokenColor = (candidate: string | undefined, mode: 'dark' | 'light'): string | undefined => {
  if (!candidate) return candidate;
  const palette = getThemePalette(mode);
  if (candidate === theme.colors.textPrimary) return palette.textPrimary;
  if (candidate === theme.colors.textMuted) return palette.textMuted;
  return candidate;
};

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}) => {
  const { themeMode, language } = useAppStore();
  const palette = getThemePalette(themeMode);

  const resolvedColor =
    mapThemeTokenColor(color, themeMode) ??
    (variant === 'muted' ? palette.textMuted : palette.textPrimary);

  const resolvedStyle = React.useMemo(() => {
    const flattened = StyleSheet.flatten(style);
    const inlineColor = flattened?.color;

    if (!inlineColor || typeof inlineColor !== 'string') return style;

    const mappedInlineColor = mapThemeTokenColor(inlineColor, themeMode);
    if (!mappedInlineColor || mappedInlineColor === inlineColor) return style;

    return [style, { color: mappedInlineColor }];
  }, [style, themeMode]);

  const localizedChildren = React.useMemo(
    () => localizeNode(children, language),
    [children, language]
  );

  return (
    <RNText
      style={[
        styles.base,
        variant === 'heading' && styles.heading,
        variant === 'title' && styles.title,
        variant === 'body' && styles.body,
        variant === 'bodySmall' && styles.bodySmall,
        variant === 'muted' && styles.muted,
        variant === 'nav' && styles.nav,
        { color: resolvedColor },
        resolvedStyle,
      ]}
      numberOfLines={numberOfLines}
    >
      {localizedChildren}
    </RNText>
  );
};

const localizeNode = (node: React.ReactNode, language: AppLanguage): React.ReactNode => {
  if (typeof node === 'string') {
    return translateLiteral(node, language);
  }

  if (Array.isArray(node)) {
    // Preserve stable keys when transforming children arrays.
    return React.Children.map(node, (child) => localizeNode(child, language));
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    if (!element.props?.children) return node;
    return React.cloneElement(element, {
      ...element.props,
      children: localizeNode(element.props.children, language),
    });
  }

  return node;
};

const styles = StyleSheet.create({
  base: {
    color: theme.colors.textPrimary,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: 'System',
    }),
  },
  heading: {
    fontSize: theme.fontSize.heading,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: theme.letterSpacing.heading,
    color: theme.colors.textPrimary,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textPrimary,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.regular,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.regular,
    color: theme.colors.textPrimary,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  muted: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.regular,
    color: theme.colors.textMuted,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  nav: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
});
