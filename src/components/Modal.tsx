import React, { useEffect, useRef, useState } from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { theme } from '../theme';
import { Text } from './Text';
import { useThemePalette } from '../theme/palette';
import { toDisplayTitleCase } from '../utils/textCase';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  leftAccessory,
  rightAccessory,
  children,
}) => {
  const palette = useThemePalette();
  const { height: viewportHeight } = useWindowDimensions();
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(18)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [renderVisible, setRenderVisible] = useState(visible);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setRenderVisible(true);
      scaleAnim.stopAnimation();
      fadeAnim.stopAnimation();
      translateYAnim.stopAnimation();
      scaleAnim.setValue(0.97);
      fadeAnim.setValue(0);
      translateYAnim.setValue(8);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 140,
          friction: 14,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 130,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!renderVisible) {
      setKeyboardHeight(0);
      return;
    }

    setKeyboardHeight(0);
    scaleAnim.stopAnimation();
    fadeAnim.stopAnimation();
    translateYAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.985,
        duration: 95,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 6,
        duration: 95,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 90,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || visible) return;
      setRenderVisible(false);
    });
  }, [fadeAnim, renderVisible, scaleAnim, translateYAnim, visible]);

  if (!renderVisible) return null;

  const keyboardOpen = keyboardHeight > 0;
  // Keep the modal centered in the space above the keyboard.
  // Adding keyboardHeight to paddingBottom shifts the center point up only as much as needed.
  const availableHeight = viewportHeight - keyboardHeight;
  const modalMaxHeight = Math.min(
    Math.round(viewportHeight * 0.9),
    availableHeight - theme.spacing.md * 2,
  );

  return (
    <RNModal
      visible={renderVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.kavRoot}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                backgroundColor: palette.overlay,
                justifyContent: 'center',
                paddingTop: theme.spacing.xxl,
                paddingBottom: keyboardOpen
                  ? keyboardHeight + theme.spacing.md
                  : theme.spacing.xxl,
                opacity: fadeAnim,
              },
            ]}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.modal,
                  {
                    backgroundColor: palette.bgSurfaceElevated,
                    borderColor: palette.borderSoft,
                    transform: [{ translateY: translateYAnim }, { scale: scaleAnim }],
                    opacity: fadeAnim,
                    maxHeight: modalMaxHeight,
                  },
                ]}
              >
                {(title || leftAccessory || rightAccessory) && (
                  <View style={styles.headerRow}>
                    <View style={styles.headerAccessorySlot}>
                      {leftAccessory}
                    </View>
                    {typeof title === 'string'
                      ? <Text variant="body" style={styles.title}>{toDisplayTitleCase(title)}</Text>
                      : <View style={styles.titleSlot}>{title}</View>
                    }
                    <View style={styles.headerAccessorySlot}>
                      {rightAccessory}
                    </View>
                  </View>
                )}
                <ScrollView
                  style={styles.bodyScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.bodyContent}
                  bounces={false}
                >
                  {children}
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
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
    overflow: 'hidden',
  },
  bodyScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingBottom: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    marginBottom: theme.spacing.md,
  },
  headerAccessorySlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.md,
  },
  titleSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
