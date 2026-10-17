import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Platform, Pressable, ScrollView, Keyboard, LayoutAnimation, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, MAX_TASK_LENGTH } from './store';
import { useTheme, space } from './theme';
import { AccentButton, Field, Muted } from './ui';
import { Cat } from './Cat';
import { tomorrowKey, prettyDay } from './dates';
import { Text } from '../src/Txt';

// how far the cat pokes out above the sheet
const CAT_OVERHANG = space(9);

// tracks the on-screen keyboard height (0 when hidden)
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // measure from the screen bottom to the keyboard top — on edge-to-edge Android
    // the reported height leaves out the nav bar sitting under the keyboard
    const show = Keyboard.addListener(showEvt, e => {
      animate();
      const fromBottom = Dimensions.get('screen').height - e.endCoordinates.screenY;
      setHeight(Math.max(e.endCoordinates.height, fromBottom));
    });
    const hide = Keyboard.addListener(hideEvt, () => { animate(); setHeight(0); });
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

// window
export function TomorrowPrompt() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { shouldPrompt, dismissPrompt, addTask, settings, enableNudge } = useStore();
  const [lines, setLines] = useState<string[]>(['']);
  const scroll = useRef<ScrollView>(null);
  const kb = useKeyboardHeight();
  const typing = kb > 0;
  const day = tomorrowKey();


  if (!shouldPrompt) return null;

  const setLine = (i: number, v: string) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? v : l)));

  const addLine = () => {
    setLines(ls => [...ls, '']);
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  };

  const save = () => {
    lines.forEach(l => addTask(l, day));
    setLines(['']);
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
                <Field
                  key={i}
                  value={l}
                  onChangeText={v => setLine(i, v)}
                  placeholder={i === 0 ? 'First thing…' : 'And…'}
                  maxLength={MAX_TASK_LENGTH}
                  returnKeyType="next"
                  autoFocus={i > 0 && i === lines.length - 1}
                  onSubmitEditing={addLine}
                  submitBehavior="submit"
                />
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
