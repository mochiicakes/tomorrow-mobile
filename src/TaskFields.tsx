import React, { useState } from 'react';
import { View, Pressable, Platform, type TextInput } from 'react-native';
import { useStore, MAX_TASK_LENGTH } from './store';
import { useTheme, space } from './theme';
import { Field, Muted } from './ui';
import { Text } from './Txt';
import { ChoiceChip, Toggle } from './controls';
import { MonthCalendar } from './MonthPicker';
import { TimePicker } from './TimePicker';
import { PixelIcon, ICONS } from './PixelIcon';
import { RepeatCheck, RepeatOptions, repeatLabel } from './RepeatPicker';
import { DetailsField } from './TaskExtras';
import { atTime, formatTime, shortDay, weekdayName } from './dates';
import { weekdayOf, type Repeat } from './recurrence';

export type TaskDraft = {
  text: string;
  details: string;
  day: string;
  remindAt: string | null;
  repeat: Repeat | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

// default reminder - the next full hour when the task is today, else 9 AM
function defaultReminder(day: string, today: string): string {
  if (day !== today) return '09:00';
  const h = Math.min(new Date().getHours() + 1, 23);
  return `${pad(h)}:00`;
}

// row - one option, folded to its current value
function Row({
  label, value, open, onPress, children,
}: {
  label: string;
  value: string;
  open: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ borderBottomWidth: 2, borderBottomColor: t.hairline }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={`${label}, ${value}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space(1.5),
          paddingVertical: space(2),
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
        <Text style={{ flex: 1, color: t.muted, fontSize: 12, textAlign: 'right' }}>{value}</Text>
        <View style={{ width: 12, alignItems: 'center' }}>
          {open
            ? <PixelIcon grid={ICONS.caret} color={t.muted} size={10} />
            : <Text style={{ color: t.muted, fontSize: 12 }}>{'>'}</Text>}
        </View>
      </Pressable>
      {open && <View style={{ paddingBottom: space(2), gap: space(1.5) }}>{children}</View>}
    </View>
  );
}

// fields - the form shared by the add and edit windows
export function TaskFields({
  draft, onChange, titleRef, repeatFrom, repeatOk, wasRepeat = null, untilLocked = false, dayLocked = false,
}: {
  draft: TaskDraft;
  onChange: (patch: Partial<TaskDraft>) => void;
  titleRef?: React.Ref<TextInput>;
  // the earliest day the repeat can apply
  repeatFrom: string;
  repeatOk: boolean;
  // the rule the task opened with; re-ticking Repeat brings it back
  wasRepeat?: Repeat | null;
  untilLocked?: boolean;
  // a new rule can't be combined with moving one day
  dayLocked?: boolean;
}) {
  const { today, tomorrow } = useStore();
  const t = useTheme();
  const [open, setOpen] = useState<'day' | 'remind' | 'repeat' | null>(null);
  const [picking, setPicking] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const { day, remindAt, repeat } = draft;

  // a rule that needs fixing stays in view
  const shown = repeatOk ? open : 'repeat';
  const toggle = (row: typeof open) => setOpen(o => (o === row ? null : row));

  const [h, m] = (remindAt ?? '09:00').split(':').map(Number);
  const passed = !repeat && remindAt !== null && atTime(day, remindAt) <= Date.now();
  const pickDay = (d: string) => { onChange({ day: d }); setPicking(false); setOpen(null); };

  return (
    <View style={{ gap: space(1.5) }}>
      <Field
        ref={titleRef}
        value={draft.text}
        onChangeText={text => onChange({ text })}
        placeholder="What needs doing?"
        accessibilityLabel="Task"
        maxLength={MAX_TASK_LENGTH}
        multiline
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        style={{ maxHeight: 140, fontSize: 17 }}
      />
      <DetailsField value={draft.details} onChange={details => onChange({ details })} />

      <View style={{ borderTopWidth: 2, borderTopColor: t.hairline }}>
        {/* day */}
        <Row
          label={repeat && !wasRepeat ? 'Starts' : 'Day'}
          value={`${weekdayName(weekdayOf(day))} ${shortDay(day)}`}
          open={shown === 'day'}
          onPress={() => toggle('day')}
        >
          {dayLocked ? (
            <Muted style={{ fontSize: 12 }}>Save the repeat change before moving this day.</Muted>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="Today" active={day === today} onPress={() => pickDay(today)} />
                <ChoiceChip label="Tomorrow" active={day === tomorrow} onPress={() => pickDay(tomorrow)} />
                <ChoiceChip label={picking ? 'Hide calendar' : 'Pick a date…'} onPress={() => setPicking(p => !p)} />
              </View>
              {picking && (
                <View style={{ marginHorizontal: -space(2) }}>
                  <MonthCalendar selected={day} onPick={pickDay} />
                </View>
              )}
            </>
          )}
        </Row>

        {/* reminder */}
        <Row
          label="Remind me"
          value={remindAt ? formatTime(h, m) : 'Off'}
          open={shown === 'remind'}
          onPress={() => toggle('remind')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Muted style={{ fontSize: 12 }}>{repeat ? 'On each repeat' : `On ${shortDay(day)}`}</Muted>
            <Toggle
              value={remindAt !== null}
              onValueChange={on => {
                onChange({ remindAt: on ? defaultReminder(day, today) : null });
                setShowTime(on);
              }}
            />
          </View>
          {remindAt !== null && (
            <>
              <Pressable
                onPress={() => setShowTime(s => (Platform.OS === 'android' ? true : !s))}
                style={{ backgroundColor: t.raised, padding: space(1.5), alignItems: 'center' }}
              >
                <Text style={{ color: t.accent, fontSize: 22, fontWeight: '700' }}>{formatTime(h, m)}</Text>
                <Muted style={{ fontSize: 12 }}>Tap to change</Muted>
              </Pressable>
              {passed && <Muted style={{ fontSize: 12 }}>That time has already passed.</Muted>}
              {showTime && (
                <TimePicker
                  hour={h}
                  minute={m}
                  onChange={(hh, mm) => onChange({ remindAt: `${pad(hh)}:${pad(mm)}` })}
                  onClose={() => setShowTime(false)}
                />
              )}
            </>
          )}
        </Row>

        {/* repeat */}
        <Row
          label="Repeat"
          value={repeat ? repeatLabel(repeat.days, repeat.until) : 'Off'}
          open={shown === 'repeat'}
          onPress={() => toggle('repeat')}
        >
          <RepeatCheck
            value={repeat}
            start={repeatFrom}
            onChange={r => onChange({ repeat: r && wasRepeat ? wasRepeat : r })}
          />
          {repeat && (
            <RepeatOptions
              value={repeat}
              start={repeatFrom}
              onChange={r => onChange({ repeat: r })}
              untilLocked={untilLocked}
            />
          )}
          {wasRepeat && !repeat && (
            <Muted style={{ fontSize: 12 }}>This day stays as a single task. Later days stop.</Muted>
          )}
        </Row>
      </View>
    </View>
  );
}
