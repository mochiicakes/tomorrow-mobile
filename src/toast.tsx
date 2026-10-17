import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, space } from './theme';
import { Text } from './Txt';

export const DANGER = '#D9534F';

type Toast = {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; onPress: () => void };
};

type Input = Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] };

// emitter - callable from anywhere, including non-UI code like auth and sync
let listener: ((t: Toast) => void) | null = null;
let seq = 0;

export function showToast(input: Input | string) {
  const t = typeof input === 'string' ? { message: input } : input;
  listener?.({ tone: 'info', ...t, id: ++seq });
}

const VISIBLE_MS = 4000;
const TAB_BAR = 56;

// host - mount once, inside the theme
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = next => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setToast(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setToast(null);
      }, VISIBLE_MS);
    };
    return () => {
      listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  const hide = () => setToast(null);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space(2), right: space(2),
        bottom: insets.bottom + TAB_BAR + space(1.5),
      }}
    >
      <Pressable
        onPress={hide}
        accessibilityRole="alert"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: space(1.5),
          backgroundColor: t.isDark ? t.raised : t.text,
          borderWidth: 2,
          borderColor: toast.tone === 'error' ? DANGER : t.isDark ? t.hairline : t.text,
          paddingVertical: 12, paddingHorizontal: space(2),
        }}
      >
        <Text style={{ flex: 1, color: t.isDark ? t.text : t.bg, fontSize: 13 }}>
          {toast.message}
        </Text>
        {toast.action && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              toast.action!.onPress();
              hide();
            }}
          >
            <Text style={{ color: t.eye, fontSize: 13, fontWeight: '700' }}>
              {toast.action.label}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}
