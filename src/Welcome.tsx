import React, { useState } from 'react';
import { Modal, View, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { AccentButton, Muted } from './ui';
import { Text } from './Txt';
import { Cat } from './Cat';

const PAGES = [
  {
    title: "Hi, I'm your cat.",
    body: 'I help you plan tomorrow, so your day starts easy.',
  },
  {
    title: "Every evening, I'll ask what you're doing tomorrow.",
    body: "Write a few things down. That's all it takes.",
  },
  {
    title: 'Tap any task to add notes, a reminder or a repeat.',
    body: 'Choose my coat and when I ask in the Cat tab.',
    closing: "You're all set! I hope Tomorrow helps you do what you set out to do.",
  },
];

// welcome - shown once, the first time the app opens on this device
export function Welcome() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { intro, finishIntro } = useStore();
  const [page, setPage] = useState(0);
  const onAlarm = usePathname() === '/alarm';

  if (intro !== 'welcome' || onAlarm) return null;

  const p = PAGES[page];
  const last = page === PAGES.length - 1;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={finishIntro}
    >
      <View style={{
        flex: 1,
        backgroundColor: t.bg,
        paddingTop: insets.top + space(2),
        paddingBottom: insets.bottom + space(3),
        paddingHorizontal: space(3),
      }}>
        {/* skip */}
        <View style={{ height: 32, alignItems: 'flex-end' }}>
          {!last && (
            <Pressable onPress={finishIntro} hitSlop={12} accessibilityRole="button">
              <Muted>Skip</Muted>
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: space(3) }}
        >
          <Cat size={170} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} />
          <View style={{ gap: space(1.5) }}>
            <Text
              accessibilityRole="header"
              style={{ color: t.text, fontSize: 24, fontWeight: '700', textAlign: 'center' }}
            >
              {p.title}
            </Text>
            <Muted style={{ fontSize: 16, textAlign: 'center' }}>{p.body}</Muted>
            {p.closing && (
              <Text style={{ color: t.accent, fontSize: 16, textAlign: 'center', marginTop: space(1) }}>
                {p.closing}
              </Text>
            )}
          </View>
        </ScrollView>

        {/* dots */}
        <View
          accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space(2) }}
        >
          {PAGES.map((_, i) => (
            <View key={i} style={{ width: 8, height: 8, backgroundColor: i === page ? t.accent : t.hairline }} />
          ))}
        </View>

        <AccentButton
          label={last ? 'Yay!' : 'Next'}
          onPress={() => (last ? finishIntro() : setPage(page + 1))}
        />
      </View>
    </Modal>
  );
}
