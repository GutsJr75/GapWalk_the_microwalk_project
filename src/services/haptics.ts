import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type FeedbackIntent =
  | 'selection'
  | 'confirm'
  | 'warning'
  | 'success'
  | 'destructive';

export const playHaptic = async (intent: FeedbackIntent): Promise<void> => {
  if (Platform.OS === 'web') return;

  try {
    switch (intent) {
      case 'selection':
        await Haptics.selectionAsync();
        return;
      case 'confirm':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'destructive':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      default:
        return;
    }
  } catch {
    // Ignore unsupported platform/device haptic failures.
  }
};
