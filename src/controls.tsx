import React from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import { Text } from './Txt';
import { useTheme, space } from './theme';

// toggle
export function Toggle({
  value, onValueChange,
}: { value: boolean; onValueChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={{
        width: 52,
        height: 28,
        borderWidth: 2,
        borderColor: value ? t.eye : t.hairline,
        backgroundColor: value ? t.eye : t.raised,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start',
        padding: 3,
      }}
    >
      <View style={{
        width: 18,
        height: 18,
        backgroundColor: value ? t.onAccent : t.muted,
      }} />
    </Pressable>
  );
}

// arrow
export function Arrow({
  dir, onPress, disabled = false, style,
}: {
  dir: 'left' | 'right';
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={({ pressed }) => [{
        width: 34,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: t.hairline,
        backgroundColor: pressed ? t.raised : 'transparent',
        opacity: disabled ? 0.35 : 1,
      }, style]}
    >
      <Text style={{ color: t.text, fontSize: 14 }}>
        {dir === 'left' ? '<' : '>'}
      </Text>
    </Pressable>
  );
}

// pager
export function Pager({
  label, onPrev, onNext, onLabelPress,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onLabelPress?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space(2),
    }}>
      <Arrow dir="left" onPress={onPrev} />
      <Pressable onPress={onLabelPress} disabled={!onLabelPress} hitSlop={8}>
        <Text style={{ color: t.text, fontSize: 13 }}>{label}</Text>
      </Pressable>
      <Arrow dir="right" onPress={onNext} />
    </View>
  );
}