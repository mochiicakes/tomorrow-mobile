import React, { useState } from 'react';
import {
  Modal, View, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { AccentButton, Field, Muted } from './ui';
import { Cat } from './Cat';
import { tomorrowKey, prettyDay } from './dates';
import { Text } from '../src/Txt';

// window
export function TomorrowPrompt() {
  const t = useTheme();
  const { shouldPrompt, dismissPrompt, addTask, settings } = useStore();
  const [lines, setLines] = useState<string[]>(['']);
  const day = tomorrowKey();


  if (!shouldPrompt) return null;

  const setLine = (i: number, v: string) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? v : l)));

  const save = () => {
    lines.forEach(l => addTask(l, day));
    setLines(['']);
    dismissPrompt();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismissPrompt}>
      {/* sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
      >
        <View style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          padding: space(3),
          paddingBottom: space(5),
          gap: space(2),
        }}>
          <View style={{ alignItems: 'center', marginTop: -space(9) }}>
            <Cat size={120} coat={t.coat} eye={t.accent} />
          </View>

          <Text style={{ color: t.text, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>
            What are you up to tomorrow?
          </Text>
          <Muted style={{ textAlign: 'center' }}>{prettyDay(day)}</Muted>

          {/* inputs */}
          <View style={{ gap: 10, marginTop: space(1) }}>
            {lines.map((l, i) => (
              <Field
                key={i}
                value={l}
                onChangeText={v => setLine(i, v)}
                placeholder={i === 0 ? 'First thing…' : 'And…'}
                returnKeyType="next"
                onSubmitEditing={() => setLines(ls => [...ls, ''])}
                blurOnSubmit={false}
              />
            ))}
            <Pressable onPress={() => setLines(ls => [...ls, ''])} hitSlop={8}>
              <Text style={{ color: t.accent, fontWeight: '600', paddingVertical: 6 }}>
                + one more
              </Text>
            </Pressable>
          </View>

          <AccentButton label="That's the plan" onPress={save} />
          <Pressable onPress={dismissPrompt} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Muted>Nothing tomorrow</Muted>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
