import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useThemePalette } from '../theme/palette';

export type AppIconName =
  | 'back'
  | 'bell'
  | 'calendar'
  | 'adjust'
  | 'info'
  | 'settings'
  | 'sync'
  | 'home'
  | 'person'
  | 'trophy'
  | 'trash'
  | 'close'
  | 'chevronRight'
  | 'chevronDown';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 18,
  color,
  strokeWidth = 1.9,
}) => {
  const palette = useThemePalette();
  const stroke = color ?? palette.textMuted;

  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'back' && (
        <>
          <Path d="M15 5L9 12L15 19" {...common} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8" {...common} />
          <Path d="M13.73 21A2 2 0 0 1 10.27 21" {...common} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Path d="M4 6H20V20H4z" {...common} />
          <Path d="M8 3V7" {...common} />
          <Path d="M16 3V7" {...common} />
          <Path d="M4 10H20" {...common} />
        </>
      )}
      {name === 'adjust' && (
        <>
          <Path d="M4 6H20" {...common} />
          <Path d="M4 12H20" {...common} />
          <Path d="M4 18H20" {...common} />
          <Circle cx="8" cy="6" r="2" fill={stroke} />
          <Circle cx="16" cy="12" r="2" fill={stroke} />
          <Circle cx="11" cy="18" r="2" fill={stroke} />
        </>
      )}
      {name === 'info' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 10V16" {...common} />
          <Circle cx="12" cy="7.2" r="1" fill={stroke} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3.2" {...common} />
          <Path d="M12 3.7V5.7" {...common} />
          <Path d="M12 18.3V20.3" {...common} />
          <Path d="M3.7 12H5.7" {...common} />
          <Path d="M18.3 12H20.3" {...common} />
          <Path d="M6.15 6.15L7.56 7.56" {...common} />
          <Path d="M16.44 16.44L17.85 17.85" {...common} />
          <Path d="M16.44 7.56L17.85 6.15" {...common} />
          <Path d="M6.15 17.85L7.56 16.44" {...common} />
        </>
      )}
      {name === 'sync' && (
        <>
          <Path d="M20 6V10H16" {...common} />
          <Path d="M4 18V14H8" {...common} />
          <Path d="M7.1 17A8 8 0 0 0 20 10" {...common} />
          <Path d="M16.9 7A8 8 0 0 0 4 14" {...common} />
        </>
      )}
      {name === 'home' && (
        <>
          <Path d="M3 10.5L12 3L21 10.5" {...common} />
          <Path d="M6 9.5V20H18V9.5" {...common} />
        </>
      )}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4 21C4 17.134 7.134 14 12 14C16.866 14 20 17.134 20 21" {...common} />
        </>
      )}
      {name === 'trophy' && (
        <>
          <Path d="M8 4H16V7A4 4 0 0 1 12 11A4 4 0 0 1 8 7V4Z" {...common} />
          <Path d="M8 5H6A2 2 0 0 0 6 9H8" {...common} />
          <Path d="M16 5H18A2 2 0 0 1 18 9H16" {...common} />
          <Path d="M12 11V15" {...common} />
          <Path d="M9 19H15" {...common} />
          <Path d="M10 15H14" {...common} />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path d="M4 7H20" {...common} />
          <Path d="M9 4H15" {...common} />
          <Path d="M7 7L8 19H16L17 7" {...common} />
          <Path d="M10 11V16" {...common} />
          <Path d="M14 11V16" {...common} />
        </>
      )}
      {name === 'close' && (
        <>
          <Path d="M18 6L6 18" {...common} />
          <Path d="M6 6L18 18" {...common} />
        </>
      )}
      {name === 'chevronRight' && <Path d="M10 6L16 12L10 18" {...common} />}
      {name === 'chevronDown' && <Path d="M6 9L12 15L18 9" {...common} />}
    </Svg>
  );
};
