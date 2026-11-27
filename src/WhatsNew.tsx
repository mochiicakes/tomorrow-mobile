import React from 'react';
import { Modal, View, ScrollView } from 'react-native';
import { usePathname } from 'expo-router';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { AccentButton } from './ui';
import { Text } from './Txt';
import { Cat } from './Cat';
import { RELEASE } from './intro';

// what's new - shown once after an update that has notes (see RELEASE in intro.ts)
export function WhatsNew() {
  const t = useTheme();
  const { intro, finishIntro } = useStore();
  const onAlarm = usePathname() === '/alarm';

  if (intro !== 'whatsNew' || onAlarm) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={finishIntro}
    >
      <View style={{
        flex: 1, justifyContent: 'center', padding: space(2),
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}>
        <View style={{ backgroundColor: t.bg, borderWidth: 2, borderColor: t.hairline, maxHeight: '85%' }}>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space(3), gap: space(2) }}>
            <View style={{ alignItems: 'center' }}>
              <Cat size={96} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} />
            </View>
            <Text
              accessibilityRole="header"
              style={{ color: t.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}
            >
              What's new
            </Text>
            <View style={{ gap: space(1.5) }}>
              {RELEASE.notes.map(note => (
                <View key={note} style={{ flexDirection: 'row', gap: space(1.5) }}>
                  <View style={{ width: 6, height: 6, marginTop: 6, backgroundColor: t.accent }} />
                  <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>{note}</Text>
                </View>
              ))}
            </View>
            <AccentButton label="Thanks for telling me!" onPress={finishIntro} style={{ marginTop: space(1) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
