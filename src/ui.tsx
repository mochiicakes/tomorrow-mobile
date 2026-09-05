import React from 'react';
import {
  View, Pressable, TextInput, StyleSheet, ViewStyle, TextStyle,
} from 'react-native';
import { useTheme, radius, space } from './theme';
import { Text } from '../src/Txt';

// screen
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

// text
export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 }}>
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.muted, fontSize: 14 }, style]}>{children}</Text>;
}

// surfaces
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[{
      backgroundColor: t.surface,
      borderRadius: radius.lg,
      padding: space(2),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.hairline,
    }, style]}>
      {children}
    </View>
  );
}

// buttons
export function AccentButton({
  label, onPress, style,
}: { label: string; onPress: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: t.accent,
        borderRadius: radius.pill,
        paddingVertical: 15,
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
      }, style]}
    >
      <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label, onPress, style,
}: { label: string; onPress: () => void; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        borderRadius: radius.pill,
        paddingVertical: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: t.hairline,
        opacity: pressed ? 0.6 : 1,
      }, style]}
    >
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

// input
export function Field(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[{
        backgroundColor: t.raised,
        borderRadius: radius.pill,
        paddingHorizontal: space(2.5),
        paddingVertical: 14,
        color: t.text,
        fontSize: 16,
        fontFamily: 'Silkscreen_400Regular',
      }, props.style]}
    />
  );
}
// check
export function Check({ done, onPress }: { done: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={{
        width: 26, height: 26, borderRadius: 13,
        borderWidth: 2,
        borderColor: done ? t.accent : t.hairline,
        backgroundColor: done ? t.accent : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.onAccent }} />}
    </Pressable>
  );
}
