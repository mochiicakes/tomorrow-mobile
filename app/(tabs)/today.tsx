import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title, Muted } from '../../src/ui';
import { DayList } from '../../src/DayList';
import { space } from '../../src/theme';
import { todayKey, prettyDay } from '../../src/dates';

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const day = todayKey();

  return (
    <Screen>
      <View style={{
        paddingTop: insets.top + space(1),
        paddingHorizontal: space(2),
        paddingBottom: space(2),
      }}>
        <Title>Today</Title>
        <Muted>{prettyDay(day)}</Muted>
      </View>
      <DayList day={day} placeholder="Something that came up…" />
    </Screen>
  );
}
