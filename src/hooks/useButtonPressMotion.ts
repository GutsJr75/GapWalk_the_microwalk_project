import { usePressMotion } from './usePressMotion';
import { buttonSizeTokens, type ButtonSize } from '../components/buttonSystem';
import type { FeedbackIntent } from '../services/haptics';

interface UseButtonPressMotionOptions {
  onPress: () => void;
  enabled?: boolean;
  size?: ButtonSize;
  hapticIntent?: FeedbackIntent | null;
}

export const useButtonPressMotion = ({
  onPress,
  enabled = true,
  size = 'default',
  hapticIntent = 'selection',
}: UseButtonPressMotionOptions) => {
  const pressScale = buttonSizeTokens[size].pressScale;

  const {
    animatedTransformStyle,
    isPressActive,
    scaleAnim,
    handlePress,
    handlePressIn,
    handlePressOut,
  } = usePressMotion({
    onPress,
    enabled,
    pressScale,
    hapticIntent,
  });

  return {
    animatedTransformStyle,
    isPressActive,
    scaleAnim,
    pressScale,
    handlePress,
    handlePressIn,
    handlePressOut,
  };
};
