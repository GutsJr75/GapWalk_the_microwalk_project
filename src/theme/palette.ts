import { useAppStore } from '../store';
import { theme } from './index';
import { withAlpha } from './colorUtils';

export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
  bgApp: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentMuted: string;
  accentBorder: string;
  accentOnSolid: string;
  accentOnTint: string;
  info: string;
  success: string;
  trendDown: string;
  pillSelectedText: string;
  inputBg: string;
  borderSoft: string;
  borderStrong: string;
  overlay: string;
  shadow: string;
}

const darkPalette: ThemePalette = {
  bgApp: theme.colors.bgApp,
  bgSurface: theme.colors.bgSurface,
  bgSurfaceElevated: theme.colors.bgSurfaceElevated,
  textPrimary: theme.colors.textPrimary,
  // Increased contrast for secondary text legibility in dark mode.
  textMuted: '#8b9bbd',
  accentPrimary: theme.colors.accentPrimary,
  accentMuted: withAlpha(theme.colors.accentPrimary, 0.12),
  accentBorder: withAlpha(theme.colors.accentPrimary, 0.25),
  accentOnSolid: '#06261d',
  accentOnTint: '#2ee9a6',
  info: '#38bdf8',
  success: '#4ade80',
  trendDown: '#fb923c',
  pillSelectedText: '#06261d',
  inputBg: 'rgba(255,255,255,0.14)',
  borderSoft: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  overlay: 'rgba(0,0,0,0.7)',
  shadow: '#000000',
};

const lightPalette: ThemePalette = {
  // Softer than pure white to reduce glare in light mode.
  bgApp: '#e6ebf2',
  bgSurface: '#ffffff',
  bgSurfaceElevated: '#edf1f7',
  textPrimary: '#111827',
  // Darker muted text to meet AA contrast across light surfaces.
  textMuted: '#475569',
  // Darker mint for readability on light surfaces (WCAG AA).
  accentPrimary: '#059669',
  accentMuted: withAlpha('#059669', 0.12),
  accentBorder: withAlpha('#059669', 0.30),
  accentOnSolid: '#ffffff',
  accentOnTint: '#0f5132',
  info: '#0369a1',
  success: '#16a34a',
  trendDown: '#c2410c',
  pillSelectedText: '#ffffff',
  inputBg: 'rgba(15,23,42,0.08)',
  borderSoft: 'rgba(15,23,42,0.10)',
  borderStrong: 'rgba(15,23,42,0.18)',
  overlay: 'rgba(2,6,23,0.45)',
  shadow: '#0f172a',
};

export const getThemePalette = (mode: ThemeMode): ThemePalette =>
  mode === 'dark' ? darkPalette : lightPalette;

export const useThemePalette = (): ThemePalette => {
  const { themeMode } = useAppStore();
  return getThemePalette(themeMode);
};
