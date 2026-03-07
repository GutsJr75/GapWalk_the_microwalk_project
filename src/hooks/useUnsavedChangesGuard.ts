import { useCallback, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';

interface UnsavedChangesGuardOptions {
  navigation: any;
  enabled: boolean;
  title: string;
  message: string;
  onConfirmDiscard?: () => void;
  onRequestConfirm?: (options: {
    title: string;
    message: string;
    onStay: () => void;
    onLeave: () => void;
  }) => void;
}

export const useUnsavedChangesGuard = ({
  navigation,
  enabled,
  title,
  message,
  onConfirmDiscard,
  onRequestConfirm,
}: UnsavedChangesGuardOptions) => {
  const allowNextBeforeRemoveRef = useRef(false);

  const runAllowedNavigation = useCallback((action: () => void) => {
    allowNextBeforeRemoveRef.current = true;
    action();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (allowNextBeforeRemoveRef.current) {
        allowNextBeforeRemoveRef.current = false;
        return;
      }
      if (!enabled) return;

      e.preventDefault();

      if (Platform.OS === 'web' && typeof (globalThis as any).confirm === 'function') {
        const ok = (globalThis as any).confirm(`${title}\n\n${message}`);
        if (ok) {
          onConfirmDiscard?.();
          allowNextBeforeRemoveRef.current = true;
          navigation.dispatch(e.data.action);
        }
        return;
      }

      if (onRequestConfirm) {
        onRequestConfirm({
          title,
          message,
          onStay: () => undefined,
          onLeave: () => {
            onConfirmDiscard?.();
            allowNextBeforeRemoveRef.current = true;
            navigation.dispatch(e.data.action);
          },
        });
        return;
      }

      Alert.alert(
        title,
        message,
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              onConfirmDiscard?.();
              allowNextBeforeRemoveRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [enabled, message, navigation, onConfirmDiscard, onRequestConfirm, title]);

  return { runAllowedNavigation };
};
