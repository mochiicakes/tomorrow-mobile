import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Pressable } from 'react-native';
import { Text } from './Txt';
import { Muted } from './ui';
import { Pager } from './controls';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { dayKey, todayKey } from './dates';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// grid
function monthCells(year: number, month: number): (Date | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// picker
export function MonthPicker({
  visible, selected, onPick, onClose,
}: {
  visible: boolean;
  selected: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const { tasksFor } = useStore();
  const [cursor, setCursor] = useState(() => parseKey(selected));

  // reopen on the selected month
  useEffect(() => {
    if (visible) setCursor(parseKey(selected));
  }, [visible, selected]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const today = todayKey();

  const shift = (n: number) => setCursor(new Date(year, month + n, 1));
  const pick = (key: string) => { onPick(key); onClose(); };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: space(2) }}
      >
        {/* sheet */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.bg,
            borderWidth: 2,
            borderColor: t.hairline,
            paddingVertical: space(2),
            gap: space(1.5),
          }}
        >
          <Pager
            label={cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
          />

          <View style={{ paddingHorizontal: space(2) }}>
            {/* weekdays */}
            <View style={{ flexDirection: 'row' }}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: t.muted }}>
                  {w}
                </Text>
              ))}
            </View>

            {/* days */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space(1) }}>
              {cells.map((d, i) => {
                if (!d) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                const key = dayKey(d);
                const active = key === selected;
                const isToday = key === today;
                const past = key < today;
                const count = tasksFor(key).length;
                return (
                  <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                    <Pressable
                      onPress={() => pick(key)}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        borderWidth: 2,
                        borderColor: active ? t.eye : isToday ? t.text : 'transparent',
                        backgroundColor: active ? t.eye : pressed ? t.raised : 'transparent',
                        opacity: past && !active ? 0.45 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13, color: active ? t.onAccent : t.text }}>
                        {d.getDate()}
                      </Text>
                      <View style={{
                        width: 4, height: 4,
                        backgroundColor: count ? (active ? t.onAccent : t.eye) : 'transparent',
                      }} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          {/* footer */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: space(2),
          }}>
            <Pressable onPress={() => pick(today)} hitSlop={8}>
              <Text style={{ color: t.eye, fontWeight: '700', fontSize: 13 }}>Today</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Muted style={{ fontSize: 13 }}>Close</Muted>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
