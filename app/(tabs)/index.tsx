import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title, Muted } from '../../src/ui';
import { DayList } from '../../src/DayList';
import { Cat } from '../../src/Cat';
import { useTheme, space } from '../../src/theme';
import { tomorrowKey, prettyDay } from '../../src/dates';
import { useStore } from '../../src/store';

export default function TomorrowScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const day = tomorrowKey();
  const { tasksFor } = useStore();
  const planned = tasksFor(day).length > 0;

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
          <Title>Tomorrow</Title>
          <Muted>{prettyDay(day)}</Muted>
        </View>
        <Cat size={80} coat={t.coat} eye={t.accent} sleeping={planned} />
      </View>

      <DayList day={day} placeholder="Add something for tomorrow…" />
    </Screen>
  );
}
