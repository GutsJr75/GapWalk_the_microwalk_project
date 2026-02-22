import { useAppStore } from '../store';
import { theme } from './index';

export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
  bgApp: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
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
