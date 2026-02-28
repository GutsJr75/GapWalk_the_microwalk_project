export const appFontFamily = {
  regular: 'SofiaPro-Regular',
  regularItalic: 'SofiaPro-RegularItalic',
  medium: 'SofiaPro-Medium',
  mediumItalic: 'SofiaPro-MediumItalic',
  semibold: 'SofiaPro-SemiBold',
  semiboldItalic: 'SofiaPro-SemiBoldItalic',
  bold: 'SofiaPro-Bold',
  boldItalic: 'SofiaPro-BoldItalic',
} as const;

export const appFontAssets = {
  [appFontFamily.regular]: require('../../assets/fonts/sofia-pro-clean/regular.otf'),
  [appFontFamily.regularItalic]: require('../../assets/fonts/sofia-pro-clean/regular-italic.otf'),
  [appFontFamily.medium]: require('../../assets/fonts/sofia-pro-clean/medium.otf'),
  [appFontFamily.mediumItalic]: require('../../assets/fonts/sofia-pro-clean/medium-italic.otf'),
  [appFontFamily.semibold]: require('../../assets/fonts/sofia-pro-clean/semibold.otf'),
  [appFontFamily.semiboldItalic]: require('../../assets/fonts/sofia-pro-clean/semibold-italic.otf'),
  [appFontFamily.bold]: require('../../assets/fonts/sofia-pro-clean/bold.otf'),
  [appFontFamily.boldItalic]: require('../../assets/fonts/sofia-pro-clean/bold-italic.otf'),
} as const;

const normalizeFontWeight = (fontWeight?: string | number | null): '400' | '500' | '600' | '700' => {
  if (fontWeight === 500 || fontWeight === '500') return '500';
  if (fontWeight === 600 || fontWeight === '600') return '600';
  if (fontWeight === 700 || fontWeight === '700' || fontWeight === '800' || fontWeight === 800) return '700';
  if (fontWeight === 'bold') return '700';
  if (fontWeight === 'semibold') return '600';
  if (fontWeight === 'medium') return '500';
  return '400';
};

export const resolveAppFontFamily = (
  fontWeight?: string | number | null,
  fontStyle?: string | null,
): string => {
  const normalizedWeight = normalizeFontWeight(fontWeight);
  const isItalic = fontStyle === 'italic';

  if (normalizedWeight === '700') {
    return isItalic ? appFontFamily.boldItalic : appFontFamily.bold;
  }
  if (normalizedWeight === '600') {
    return isItalic ? appFontFamily.semiboldItalic : appFontFamily.semibold;
  }
  if (normalizedWeight === '500') {
    return isItalic ? appFontFamily.mediumItalic : appFontFamily.medium;
  }
  return isItalic ? appFontFamily.regularItalic : appFontFamily.regular;
};

// GapWalk Theme — exact Figma design tokens
export const theme = {
  colors: {
    // Backgrounds
    bgApp: '#0b1220',
    bgSurface: '#111b2e',
    bgSurfaceElevated: '#16233a',

    // Text
    textPrimary: '#eaf0ff',
    textMuted: '#6f7a95',

    // Accent
    accentPrimary: '#2ee9a6',

    // Functional
    white: '#ffffff',
    black: '#000000',
    error: '#ef4444',
    warning: '#f59e0b',
    danger: '#ef4444',
  },

  spacing: {
    xs: 4,
    ms: 6,
    sm: 8,
    ml: 10,
    md: 16,
    lg: 20,
    xl: 30,
    xxl: 32,
  },

  borderRadius: {
    sm: 8,
    md: 12,
    lg: 14,
    xl: 999,
  },

  fontSize: {
    xxs: 11,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 19,
    xl: 27,
    heading: 40,
    display: 42,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  fontFamily: {
    regular: appFontFamily.regular,
    medium: appFontFamily.medium,
    semibold: appFontFamily.semibold,
    bold: appFontFamily.bold,
  },

  letterSpacing: {
    heading: 0.72, // 2% of 36
  },

  shadow: {
    card: {
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
  },

  layout: {
    contentMaxWidth: 393,
    contentHorizontal: 18,
    sectionVertical: 30,
    buttonHeight: 46,
  },
} as const;

export type Theme = typeof theme;
