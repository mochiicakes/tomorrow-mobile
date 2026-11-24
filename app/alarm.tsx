import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Muted, AccentButton } from '../src/ui';
import { Text } from '../src/Txt';
import { Cat } from '../src/Cat';
import { useTheme, space } from '../src/theme';
import { useStore } from '../src/store';
import TomorrowAlarm from '../modules/tomorrow-alarm';

// ringing - opened by the native alarm's full-screen intent (or by tapping it)
export default function AlarmScreen() {
  const t = useTheme();
  const { forcePrompt, getTask } = useStore();
  const { kind, id, title, body } = useLocalSearchParams<{
    kind?: string; id?: string; title?: string; body?: string;
  }>();
  // prefer the live task text in case it was edited since the alarm was set
  const text = (kind === 'task' && id && getTask(id)?.text) || body || '';

  useEffect(() => {
    TomorrowAlarm?.setShowWhenLocked(true);
    return () => { TomorrowAlarm?.setShowWhenLocked(false); };
  }, []);

  const dismiss = () => {
    TomorrowAlarm?.stopRinging();
    router.replace(kind === 'task' ? '/today' : '/');
    if (kind === 'nudge') forcePrompt();
  };

  return (
    <Screen style={{ justifyContent: 'center', alignItems: 'center', padding: space(3), gap: space(3) }}>
      <Cat size={180} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} />
      <View style={{ alignItems: 'center', gap: space(1) }}>
        <Text style={{ color: t.text, fontSize: 28, fontWeight: '700', textAlign: 'center' }}>
          {title || 'Meow!'}
        </Text>
        {!!text && <Muted style={{ textAlign: 'center', fontSize: 16 }}>{text}</Muted>}
      </View>
      <AccentButton label="Dismiss" onPress={dismiss} style={{ alignSelf: 'stretch' }} />
    </Screen>
  );
}
