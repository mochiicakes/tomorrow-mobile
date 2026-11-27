import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title, Muted } from '../../src/ui';
import { DayList } from '../../src/DayList';
import { Cat } from '../../src/Cat';
import { useTheme, space } from '../../src/theme';
import { prettyDay } from '../../src/dates';
import { useStore } from '../../src/store';

export default function TodayScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // from the store so the screen re-renders when the day rolls over
  const { tasksFor, today: day } = useStore();
  const items = tasksFor(day);
  // the cat rests once everything for today is done
  const allDone = items.length > 0 && items.every(x => x.done);

  return (
    <Screen>
      {/* header */}
      <View style={{
        paddingTop: insets.top + space(1),
        paddingHorizontal: space(2),
        paddingBottom: space(2),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <View>
          <Title>Today</Title>
          <Muted>{prettyDay(day)}</Muted>
        </View>
        <Cat size={80} coat={t.coat} eye={t.accent} pattern={t.pattern} marks={t.marks} sleeping={allDone} />
      </View>

      <DayList day={day} placeholder="Something that came up…" />
    </Screen>
  );
}
