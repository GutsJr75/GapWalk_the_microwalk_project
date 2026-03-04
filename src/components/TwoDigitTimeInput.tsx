import React, { useEffect, useRef } from 'react';
import {
  Platform,
  StyleProp,
  TextInput,
  TextInputProps,
  TextStyle,
} from 'react-native';
import { useThemePalette } from '../theme/palette';
import { theme } from '../theme';

export type TimeInputMode = 'hour' | 'minute';

const onlyDigits = (value: string, max = 2): string => value.replace(/[^0-9]/g, '').slice(0, max);

const normalizeHourTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText, 2);
  if (digits.length === 0) return '';

  if (digits.length === 1) {
    const first = digits[0];
    if (first === '0' || first === '1') return first;
    return `0${first}`;
  }

  const [first, second] = digits;
  if (first === '0') {
    if (second === '0') return '0';
    return `0${second}`;
  }
  if (first === '1') {
    return Number(second) <= 2 ? `1${second}` : '1';
  }
  return `0${first}`;
};

const normalizeMinuteTyping = (nextText: string): string => {
  const digits = onlyDigits(nextText, 2);
  if (digits.length === 0) return '';

  if (digits.length === 1) {
    const first = Number(digits[0]);
    if (first >= 6) return `0${digits[0]}`;
    return digits[0];
  }

  const [first, second] = digits;
  if (Number(first) > 5) return `0${first}`;
  const n = Number(`${first}${second}`);
  return n <= 59 ? `${first}${second}` : first;
};

const isValidHour = (value: string): boolean => {
  if (value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12;
};

const isValidMinute = (value: string): boolean => {
  if (value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 59;
};

const normalizeTyping = (mode: TimeInputMode, nextText: string): string =>
  mode === 'hour' ? normalizeHourTyping(nextText) : normalizeMinuteTyping(nextText);

const normalizeOnBlur = (mode: TimeInputMode, value: string): string => {
  if (value === '') return '';
  if (mode === 'hour') return isValidHour(value) ? String(Number(value)).padStart(2, '0') : '';
  return isValidMinute(value) ? String(Number(value)).padStart(2, '0') : '';
};

interface TwoDigitTimeInputProps {
  mode: TimeInputMode;
  value: string;
  onChange: (value: string) => void;
  onBlurNormalize: (value: string) => void;
  placeholder: string;
  style: StyleProp<TextStyle>;
  placeholderTextColor?: string;
  onAutoComplete?: () => void;
  inputRef?: React.Ref<TextInput>;
  returnKeyType?: TextInputProps['returnKeyType'];
}

export const TwoDigitTimeInput: React.FC<TwoDigitTimeInputProps> = ({
  mode,
  value,
  onChange,
  onBlurNormalize,
  placeholder,
  style,
  placeholderTextColor,
  onAutoComplete,
  inputRef,
  returnKeyType = 'next',
}) => {
  const palette = useThemePalette();
  const latestValueRef = useRef(value);
  const webTextInputReset: StyleProp<TextStyle> = Platform.OS === 'web'
    ? ({
        outlineWidth: 0,
      } as TextStyle)
    : undefined;

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  return (
    <TextInput
      ref={inputRef}
      style={[style, webTextInputReset]}
      value={value}
      onChangeText={(nextText) => {
        const normalized = normalizeTyping(mode, nextText);
        latestValueRef.current = normalized;
        onChange(normalized);
        if (mode === 'hour' && normalized.length === 2 && normalized !== value) {
          requestAnimationFrame(() => {
            onAutoComplete?.();
          });
        }
      }}
      onBlur={() => {
        const normalized = normalizeOnBlur(mode, latestValueRef.current);
        latestValueRef.current = normalized;
        onBlurNormalize(normalized);
      }}
      keyboardType="number-pad"
      maxLength={2}
      underlineColorAndroid="transparent"
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? palette.textMuted ?? theme.colors.textMuted}
      selectTextOnFocus
      returnKeyType={returnKeyType}
    />
  );
};
