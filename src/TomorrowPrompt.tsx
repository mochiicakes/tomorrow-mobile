import React, { useRef, useState } from 'react';
import {
  Modal, View, Pressable, ScrollView, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { useStore, MAX_TASK_LENGTH } from './store';
import { useTheme, space } from './theme';
import { AccentButton, Field, Muted } from './ui';
import { Cat } from './Cat';
import { prettyDay } from './dates';
import { TaskExtras } from './TaskExtras';
import { useKeyboardHeight } from './useKeyboardHeight';
import { repeatValid, type Repeat } from './recurrence';
import { DANGER } from './toast';
import { Text } from '../src/Txt';

// how far the cat pokes out above the sheet
const CAT_OVERHANG = space(9);

type Line = { text: string; details: string; repeat: Repeat | null };
const BLANK: Line = { text: '', details: '', repeat: null };

// window
export function TomorrowPrompt() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { shouldPrompt, dismissPrompt, addTask, settings, enableNudge, tomorrow: day } = useStore();
  const [lines, setLines] = useState<Line[]>([BLANK]);
  const [error, setError] = useState<string | null>(null);
  // the line being typed in; only it shows its options, to keep the prompt clean
  const [active, setActive] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const kb = useKeyboardHeight();
  const typing = kb > 0;
  // the ringing alarm screen opens the prompt itself once dismissed
  const onAlarm = usePathname() === '/alarm';

  if (!shouldPrompt || onAlarm) return null;

  const setLine = (i: number, patch: Partial<Line>) => {
    setError(null);
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines(ls => [...ls, BLANK]);
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  };

  const save = () => {
    // never drop details or a repeat the user set up
    if (lines.some(l => !l.text.trim() && (l.details.trim() || l.repeat))) {
      return setError('Give every task a title first.');
    }
    if (lines.some(l => l.repeat && !repeatValid(l.repeat, day))) {
      return setError('Check the repeat days and end date.');
    }
    lines.forEach(l => addTask(l.text, day, { details: l.details, repeat: l.repeat }));
    setLines([BLANK]);
    setActive(null);
    Keyboard.dismiss();
    if (settings.notificationsOn) enableNudge();
    dismissPrompt();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismissPrompt}>
      {/* backdrop — lifts the sheet above the keyboard */}
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
        paddingBottom: kb,
      }}>
        {/* sheet — grows to fill the space above the keyboard while typing */}
        <View style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          marginTop: insets.top + CAT_OVERHANG,
          paddingHorizontal: space(3),
          paddingTop: space(3),
          paddingBottom: typing ? space(2) : space(5) + insets.bottom,
          flexShrink: 1,
          ...(typing && { flex: 1 }),
        }}>
          <View style={{ alignItems: 'center', marginTop: -space(3) - CAT_OVERHANG, marginBottom: space(2) }}>
            <Cat size={120} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} />
          </View>

          <ScrollView
            ref={scroll}
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ gap: space(2) }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ color: t.text, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>
              What are you up to tomorrow?
            </Text>
            <Muted style={{ textAlign: 'center' }}>{prettyDay(day)}</Muted>

            {/* inputs */}
            <View style={{ gap: 10, marginTop: space(1) }}>
              {lines.map((l, i) => (
                <View key={i} style={{ gap: space(1.5), paddingBottom: space(1) }}>
                  <Field
                    value={l.text}
                    onChangeText={v => setLine(i, { text: v })}
                    placeholder={i === 0 ? 'First thing…' : 'And…'}
                    maxLength={MAX_TASK_LENGTH}
                    returnKeyType="next"
                    autoFocus={i > 0 && i === lines.length - 1}
                    onFocus={() => setActive(i)}
                    onSubmitEditing={addLine}
                    submitBehavior="submit"
                  />
                  {((active === i && l.text.trim() !== '') || l.details !== '' || l.repeat !== null) && (
                    <TaskExtras
                      day={day}
                      details={l.details}
                      repeat={l.repeat}
                      onDetails={details => setLine(i, { details })}
                      onRepeat={repeat => { setActive(i); setLine(i, { repeat }); }}
                    />
                  )}
                </View>
              ))}
              <Pressable onPress={addLine} hitSlop={8}>
                <Text style={{ color: t.accent, fontWeight: '600', paddingVertical: 6 }}>
                  + one more
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* actions stay pinned under the inputs */}
          <View style={{ gap: space(2), marginTop: space(2), ...(typing && { marginTop: 'auto' }) }}>
            {error && <Text style={{ color: DANGER, fontSize: 12, textAlign: 'center' }}>{error}</Text>}
            <AccentButton label="That's the plan" onPress={save} />
            {!typing && (
              <Pressable onPress={dismissPrompt} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Muted>Nothing tomorrow</Muted>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
