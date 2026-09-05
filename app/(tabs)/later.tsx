import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title, Muted } from '../../src/ui';
import { Text } from '../../src/Txt';
import { DayList } from '../../src/DayList';
import { useStore } from '../../src/store';
import { useTheme, space } from '../../src/theme';
import { dayKey, addDays, prettyDay, todayKey } from '../../src/dates';
import { Pager } from '../../src/controls';

const WINDOW = 14;

export default function LaterScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { tasksFor } = useStore();
  const scroller = useRef<ScrollView>(null);

  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(() => dayKey(addDays(new Date(), 0)));

  const days = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => addDays(new Date(), offset + i)),
    [offset],
  );

  const page = (delta: number) => {
    setOffset(o => o + delta);
    scroller.current?.scrollTo({ x: 0, animated: false });
  };

  const monthLabel = () => {
    const first = days[0];
    const last = days[days.length - 1];
    const f = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const l = last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return f === l ? f : `${first.toLocaleDateString(undefined, { month: 'short' })} — ${l}`;
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space(1), paddingHorizontal: space(2) }}>
        <Title>Later</Title>
        <Muted>Plan further out if you already know.</Muted>
      </View>

      {/* pager */}
      <View style={{ paddingTop: space(2) }}>
        <Pager
          label={monthLabel()}
          onPrev={() => page(-WINDOW)}
          onNext={() => page(WINDOW)}
          onLabelPress={() => { setOffset(0); scroller.current?.scrollTo({ x: 0, animated: false }); }}
        />
      </View>

      {/* strip */}
      <View style={{ height: 78, marginTop: space(1.5) }}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space(2), gap: 8, alignItems: 'flex-start' }}
        >
          {days.map(d => {
            const key = dayKey(d);
            const active = key === selected;
            const isToday = key === todayKey();
            const past = key < todayKey();
            const count = tasksFor(key).length;
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                style={{
                  width: 54, height: 70, paddingVertical: 8,
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  backgroundColor: active ? t.eye : t.surface,
                  borderWidth: 2,
                  borderColor: active ? t.eye : isToday ? t.text : t.hairline,
                  opacity: past && !active ? 0.45 : 1,
                }}
              >
                <Text style={{ fontSize: 9, color: active ? t.onAccent : t.muted }}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: active ? t.onAccent : t.text }}>
                  {d.getDate()}
                </Text>
                <View style={{
                  width: 5, height: 5,
                  backgroundColor: count ? (active ? t.onAccent : t.eye) : 'transparent',
                }} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ paddingHorizontal: space(2), paddingVertical: space(1.5) }}>
        <Muted>{prettyDay(selected)}</Muted>
      </View>

      <DayList day={selected} placeholder="Add to this day…" />
    </Screen>
  );
}