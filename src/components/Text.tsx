import React from 'react';
import { Text as RNText, StyleSheet, TextStyle, Platform, StyleProp } from 'react-native';
import { resolveAppFontFamily, theme } from '../theme';
import { useAppStore } from '../store';
import { getThemePalette } from '../theme/palette';
import { AppLanguage, translateLiteral } from '../i18n';
import { toDisplayTitleCase } from '../utils/textCase';

interface TextProps {
  children: React.ReactNode;
  variant?: 'heading' | 'title' | 'body' | 'bodySmall' | 'muted' | 'nav';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  ellipsizeMode?: React.ComponentProps<typeof RNText>['ellipsizeMode'];
  allowFontScaling?: boolean;
}

const mapThemeTokenColor = (candidate: string | undefined, mode: 'dark' | 'light'): string | undefined => {
  if (!candidate) return candidate;
  const palette = getThemePalette(mode);
  if (candidate === theme.colors.textPrimary) return palette.textPrimary;
  if (candidate === theme.colors.textMuted) return palette.textMuted;
  if (candidate === theme.colors.accentPrimary) return palette.accentPrimary;
  return candidate;
};

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  ellipsizeMode,
  allowFontScaling = true,
}) => {
  const { themeMode, language } = useAppStore();
  const palette = getThemePalette(themeMode);
  const variantStyle = React.useMemo(() => {
    if (variant === 'heading') return styles.heading;
    if (variant === 'title') return styles.title;
    if (variant === 'body') return styles.body;
    if (variant === 'bodySmall') return styles.bodySmall;
    if (variant === 'muted') return styles.muted;
    return styles.nav;
  }, [variant]);

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

  const clippingFixStyle = React.useMemo(() => {
    const flattened = StyleSheet.flatten([styles.base, variantStyle, resolvedStyle]) as TextStyle | undefined;
    const fontSize = typeof flattened?.fontSize === 'number' ? flattened.fontSize : null;
    const lineHeight = typeof flattened?.lineHeight === 'number' ? flattened.lineHeight : null;

    if (!fontSize || !lineHeight) return undefined;

    const minLineHeight = Math.ceil(fontSize * (Platform.OS === 'android' ? 1.24 : 1.2));
    if (lineHeight >= minLineHeight) return undefined;

    // Guard against clipped glyphs when a larger fontSize inherits a smaller lineHeight.
    return { lineHeight: minLineHeight };
  }, [resolvedStyle, variantStyle]);

  const fontFamilyOverride = React.useMemo(() => {
    const flattened = StyleSheet.flatten([styles.base, variantStyle, resolvedStyle]) as TextStyle | undefined;
    return {
      fontFamily: resolveAppFontFamily(flattened?.fontWeight, flattened?.fontStyle),
      // Use the matching Sofia Pro face directly instead of synthetic weight/style.
      fontWeight: '400' as const,
      fontStyle: 'normal' as const,
    };
  }, [resolvedStyle, variantStyle]);

  const localizedChildren = React.useMemo(
    () => localizeNode(children, language),
    [children, language]
  );
  const displayChildren = React.useMemo(() => {
    const shouldTitleCase = variant === 'heading' || variant === 'title' || variant === 'nav';
    if (!shouldTitleCase) return localizedChildren;
    return titleCaseNode(localizedChildren);
  }, [localizedChildren, variant]);

  return (
    <RNText
      style={[
        styles.base,
        variantStyle,
        { color: resolvedColor },
        resolvedStyle,
        fontFamilyOverride,
        clippingFixStyle,
      ]}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      allowFontScaling={allowFontScaling}
    >
      {displayChildren}
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

const titleCaseNode = (node: React.ReactNode): React.ReactNode => {
  if (typeof node === 'string') {
    return toDisplayTitleCase(node);
  }

  if (Array.isArray(node)) {
    return React.Children.map(node, (child) => titleCaseNode(child));
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    if (!element.props?.children) return node;
    return React.cloneElement(element, {
      ...element.props,
      children: titleCaseNode(element.props.children),
    });
  }

  return node;
};

const styles = StyleSheet.create({
  base: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fontFamily.regular,
  },
  heading: {
    fontSize: theme.fontSize.heading,
    fontWeight: theme.fontWeight.semibold,
    fontFamily: theme.fontFamily.semibold,
    letterSpacing: theme.letterSpacing.heading,
    color: theme.colors.textPrimary,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.textPrimary,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.regular,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.regular,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.textPrimary,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  muted: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.regular,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.textMuted,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  nav: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
});
