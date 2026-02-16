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
    danger: '#b91c1c',
  },

  spacing: {
    xs: 4,
    sm: 8,
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
    xs: 12,
    sm: 14,
    md: 16,
    lg: 17,
    xl: 24,
    heading: 36,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  letterSpacing: {
    heading: 0.72, // 2% of 36
  },

  layout: {
    contentMaxWidth: 393,
    contentHorizontal: 18,
    sectionVertical: 30,
    buttonHeight: 46,
  },
} as const;

export type Theme = typeof theme;
