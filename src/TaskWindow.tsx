import React, { useState } from 'react';
import { Modal, View, Pressable, ScrollView, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, space } from './theme';
import { GhostButton, Title } from './ui';
import { Text } from './Txt';
import { DANGER } from './toast';
import { useKeyboardHeight } from './useKeyboardHeight';

// window - full-screen shell for adding and editing a task. The footer stays
// above the keyboard and the phone's navigation bar.
export function TaskWindow({
  title, dirty, onClose, onShow, footer, children,
}: {
  title: string;
  // leaving asks first while there are unsaved changes
  dirty: boolean;
  onClose: () => void;
  onShow?: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [discarding, setDiscarding] = useState(false);

  const close = () => {
    if (!dirty) return onClose();
    Keyboard.dismiss();
    setDiscarding(true);
  };

  const bar = discarding && dirty ? (
    <View style={{ gap: space(1) }}>
      <Text style={{ color: t.text, fontSize: 14, textAlign: 'center' }}>Discard your changes?</Text>
      <GhostButton label="Keep editing" onPress={() => setDiscarding(false)} />
      <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: space(1) }}>
        <Text style={{ color: DANGER, fontSize: 13 }}>Discard</Text>
      </Pressable>
    </View>
  ) : footer;

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      onShow={onShow}
    >
      <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: kb }}>
        {/* header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: space(1.5),
          paddingTop: insets.top + space(1),
          paddingHorizontal: space(2),
          paddingBottom: space(1.5),
        }}>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 34, height: 30,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: t.hairline,
            }}
          >
            <Text style={{ color: t.text, fontSize: 14 }}>{'<'}</Text>
          </Pressable>
          <Title>{title}</Title>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: space(2),
            paddingBottom: space(3) + (bar || kb ? 0 : insets.bottom),
            gap: space(2),
          }}
        >
          {children}
        </ScrollView>

        {bar && (
          <View style={{
            paddingHorizontal: space(2),
            paddingTop: space(1.5),
            paddingBottom: space(1.5) + (kb ? 0 : insets.bottom),
            borderTopWidth: 2,
            borderTopColor: t.hairline,
            backgroundColor: t.bg,
          }}>
            {bar}
          </View>
        )}
      </View>
    </Modal>
  );
}
