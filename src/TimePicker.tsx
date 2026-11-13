import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, space } from './theme';

const pad = (n: number) => String(n).padStart(2, '0');

// time - the native picker on iOS/Android; it has no web build, so web gets
// the browser's own time input
export function TimePicker({
  hour, minute, onChange, onClose,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  // Android's picker is a one-shot dialog; tell the caller it closed
  onClose?: () => void;
}) {
  const t = useTheme();

  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'time',
      value: `${pad(hour)}:${pad(minute)}`,
      autoFocus: true,
      onChange: (e: { target: { value: string } }) => {
        const [h, m] = e.target.value.split(':').map(Number);
        if (Number.isFinite(h) && Number.isFinite(m)) onChange(h, m);
      },
      style: {
        alignSelf: 'center',
        fontSize: 20,
        padding: space(1),
        color: t.text,
        backgroundColor: t.raised,
        border: `2px solid ${t.hairline}`,
        colorScheme: t.isDark ? 'dark' : 'light',
      },
    });
  }

  const value = new Date();
  value.setHours(hour, minute, 0, 0);
  return (
    <DateTimePicker
      value={value}
      mode="time"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(e, date) => {
        if (Platform.OS !== 'ios') onClose?.();
        if (e.type === 'set' && date) onChange(date.getHours(), date.getMinutes());
      }}
    />
  );
}
