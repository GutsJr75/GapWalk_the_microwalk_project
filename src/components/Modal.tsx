import React from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';
import { useThemePalette } from '../theme/palette';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  children,
}) => {
  const palette = useThemePalette();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
          <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.modal,
                  {
                    backgroundColor: palette.bgSurfaceElevated,
                    borderColor: palette.borderSoft,
                  },
                ]}
              >
                {title && (
                  <Text variant="body" style={styles.title}>
                    {title}
                  </Text>
                )}
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.bodyContent}
                  bounces={false}
                >
                  {children}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  kavRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
  },
  modal: {
    backgroundColor: theme.colors.bgSurfaceElevated,
    borderRadius: theme.borderRadius.lg,
    padding: 22,
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bodyContent: {
    paddingBottom: 2,
  },
  title: {
    textAlign: 'center',
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.lg,
    marginBottom: theme.spacing.md,
  },
});
