import { type TextStyle, type ViewStyle } from 'react-native';
import { theme } from '../theme';
import { motion } from '../theme/motion';
import { withAlpha } from '../theme/colorUtils';
import type { ThemePalette } from '../theme/palette';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'muted' | 'danger' | 'info';
export type ButtonSize = 'default' | 'compact' | 'icon';

export const buttonSizeTokens = {
  default: {
    minHeight: theme.layout.buttonHeight,
    minWidth: 120,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.fontSize.md,
    lineHeight: theme.fontSize.md + 6,
    pressScale: motion.scale.pressStandard,
  },
  compact: {
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm + 4,
    pressScale: motion.scale.pressSubtle,
  },
  icon: {
    minHeight: 38,
    minWidth: 38,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 19,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm + 4,
    pressScale: motion.scale.pressSubtle,
  },
} as const satisfies Record<ButtonSize, {
  minHeight: number;
  minWidth: number;
  paddingHorizontal: number;
  paddingVertical: number;
  borderRadius: number;
  fontSize: number;
  lineHeight: number;
  pressScale: number;
}>;

export const compactActionTokens = {
  minHeight: buttonSizeTokens.compact.minHeight,
  minWidth: 42,
  borderRadius: buttonSizeTokens.compact.borderRadius,
  paddingHorizontal: buttonSizeTokens.compact.paddingHorizontal,
  paddingVertical: buttonSizeTokens.compact.paddingVertical,
  labelFontSize: buttonSizeTokens.compact.fontSize,
  labelLineHeight: buttonSizeTokens.compact.lineHeight,
  borderWidth: 1.5,
} as const;

interface ButtonVisualState {
  containerStyle: ViewStyle;
  labelColor: string;
  iconColor: string;
  spinnerColor: string;
  rippleColor: string;
  glowColor: string | null;
  glowOpacity: number;
}

export const getButtonContainerSizeStyle = (size: ButtonSize): ViewStyle => {
  const metrics = buttonSizeTokens[size];
  if (size === 'icon') {
    return {
      width: metrics.minWidth,
      minWidth: metrics.minWidth,
      minHeight: metrics.minHeight,
      paddingHorizontal: metrics.paddingHorizontal,
      paddingVertical: metrics.paddingVertical,
      borderRadius: metrics.borderRadius,
    };
  }

  return {
    minWidth: metrics.minWidth,
    minHeight: metrics.minHeight,
    paddingHorizontal: metrics.paddingHorizontal,
    paddingVertical: metrics.paddingVertical,
    borderRadius: metrics.borderRadius,
  };
};

export const getButtonTextSizeStyle = (size: ButtonSize): TextStyle => {
  const metrics = buttonSizeTokens[size];
  return {
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
    fontWeight: theme.fontWeight.semibold,
  };
};

export const getButtonVisualState = (
  variant: ButtonVariant,
  palette: ThemePalette,
): ButtonVisualState => {
  switch (variant) {
    case 'primary':
      return {
        containerStyle: { backgroundColor: palette.accentPrimary },
        labelColor: palette.accentOnSolid,
        iconColor: palette.accentOnSolid,
        spinnerColor: palette.accentOnSolid,
        rippleColor: 'rgba(255,255,255,0.18)',
        glowColor: palette.accentPrimary,
        glowOpacity: 0.2,
      };
    case 'secondary':
      return {
        containerStyle: {
          backgroundColor: palette.bgSurface,
          borderWidth: 1.5,
          borderColor: palette.borderStrong,
        },
        labelColor: palette.textPrimary,
        iconColor: palette.textPrimary,
        spinnerColor: palette.textPrimary,
        rippleColor: palette.inputBg,
        glowColor: palette.accentPrimary,
        glowOpacity: 0.12,
      };
    case 'outline':
      return {
        containerStyle: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: palette.borderStrong,
        },
        labelColor: palette.textPrimary,
        iconColor: palette.textPrimary,
        spinnerColor: palette.textPrimary,
        rippleColor: palette.inputBg,
        glowColor: palette.accentPrimary,
        glowOpacity: 0.1,
      };
    case 'danger':
      return {
        containerStyle: {
          backgroundColor: withAlpha(theme.colors.danger, 0.12),
          borderWidth: 1.5,
          borderColor: withAlpha(theme.colors.danger, 0.34),
        },
        labelColor: theme.colors.danger,
        iconColor: theme.colors.danger,
        spinnerColor: theme.colors.danger,
        rippleColor: withAlpha(theme.colors.danger, 0.18),
        glowColor: theme.colors.danger,
        glowOpacity: 0.16,
      };
    case 'info':
      return {
        containerStyle: {
          backgroundColor: withAlpha(palette.info, 0.14),
          borderWidth: 1.5,
          borderColor: withAlpha(palette.info, 0.3),
        },
        labelColor: palette.info,
        iconColor: palette.info,
        spinnerColor: palette.info,
        rippleColor: withAlpha(palette.info, 0.18),
        glowColor: palette.info,
        glowOpacity: 0.16,
      };
    case 'muted':
    default:
      return {
        containerStyle: {
          backgroundColor: 'transparent',
        },
        labelColor: palette.textMuted,
        iconColor: palette.textMuted,
        spinnerColor: palette.textMuted,
        rippleColor: palette.inputBg,
        glowColor: null,
        glowOpacity: 0,
      };
  }
};
