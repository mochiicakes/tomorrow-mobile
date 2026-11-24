import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useTheme, space } from './theme';
import { Check, Muted } from './ui';
import { Text } from './Txt';
import { ChoiceChip } from './controls';
import { MonthCalendar } from './MonthPicker';
import { DANGER } from './toast';
import { shortDay, weekdayName } from './dates';
import { firstMatch, repeatValid, weekdayOf, type Repeat } from './recurrence';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// label - "Every day", "Weekdays", "Mon, Wed · until 31 Dec"
export function repeatLabel(days: number[], until: string | null): string {
  const key = days.join('');
  const base =
    days.length === 7 ? 'Every day'
    : key === '12345' ? 'Weekdays'
    : key === '06' ? 'Weekends'
    : days.map(d => weekdayName(d)).join(', ');
  return until ? `${base} · until ${shortDay(until)}` : base;
}

// checkbox - ticking it starts from the weekday of the day in view
export function RepeatCheck({
  value, start, onChange,
}: { value: Repeat | null; start: string; onChange: (r: Repeat | null) => void }) {
  const t = useTheme();
  const toggle = () => onChange(value ? null : { days: [weekdayOf(start)], until: null });
  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="checkbox"
      aria-checked={value !== null}
      accessibilityLabel="Repeat"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <View pointerEvents="none"><Check done={value !== null} onPress={() => {}} /></View>
      <Text style={{ color: t.text, fontSize: 13 }}>Repeat</Text>
    </Pressable>
  );
}

// options - weekdays, and an optional last day
export function RepeatOptions({
  value, start, onChange, untilLocked = false,
}: {
  value: Repeat;
  // the earliest day the rule can apply
  start: string;
  onChange: (r: Repeat) => void;
  // a later edit carries on from the end date, so it can't move
  untilLocked?: boolean;
}) {
  const t = useTheme();
  const [picking, setPicking] = useState(false);
  const first = firstMatch(value.days, start) ?? start;

  const toggleDay = (d: number) => onChange({
    ...value,
    days: value.days.includes(d) ? value.days.filter(x => x !== d) : [...value.days, d].sort(),
  });

  return (
    <View style={{ gap: space(1.5) }}>
      {/* weekdays */}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {ALL_DAYS.map(d => {
          const on = value.days.includes(d);
          return (
            <Pressable
              key={d}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              aria-checked={on}
              accessibilityLabel={weekdayName(d, 'long')}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderWidth: 2,
                borderColor: on ? t.eye : t.hairline,
                backgroundColor: on ? t.eye : pressed ? t.raised : t.surface,
              })}
            >
              <Text style={{ fontSize: 11, color: on ? t.onAccent : t.text }}>
                {weekdayName(d).slice(0, 2).toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* span */}
      {untilLocked ? (
        <Muted style={{ fontSize: 12 }}>
          {value.until ? `Runs to ${shortDay(value.until)}, then carries on with your later changes.` : ''}
        </Muted>
      ) : (
        <View style={{ gap: space(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Muted style={{ fontSize: 12 }}>Ends</Muted>
            <ChoiceChip
              label="Never"
              active={value.until === null}
              onPress={() => { setPicking(false); onChange({ ...value, until: null }); }}
            />
            <ChoiceChip
              label={value.until ? shortDay(value.until) : 'On a date…'}
              active={value.until !== null}
              onPress={() => setPicking(p => !p)}
            />
          </View>
          {picking && (
            <View style={{ marginHorizontal: -space(2) }}>
              <MonthCalendar
                selected={value.until ?? first}
                min={first}
                onPick={until => { setPicking(false); onChange({ ...value, until }); }}
              />
            </View>
          )}
        </View>
      )}

      {!value.days.length ? (
        <Text style={{ color: DANGER, fontSize: 12 }}>Tick at least one day.</Text>
      ) : !untilLocked && !repeatValid(value, start) ? (
        <Text style={{ color: DANGER, fontSize: 12 }}>No ticked day falls before the end date.</Text>
      ) : (
        <Muted style={{ fontSize: 12 }}>{repeatLabel(value.days, value.until)}</Muted>
      )}
    </View>
  );
}
