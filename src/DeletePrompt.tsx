import React, { useState } from 'react';
import { Modal, View, Pressable, ScrollView } from 'react-native';
import { useStore, type Task } from './store';
import { useTheme, space } from './theme';
import { AccentButton, GhostButton, Muted } from './ui';
import { Text } from './Txt';
import { ChoiceChip } from './controls';
import { MonthCalendar } from './MonthPicker';
import { repeatLabel } from './RepeatPicker';
import { showToast } from './toast';
import { shortDay } from './dates';
import type { Span } from './recurrence';

// delete - a plain task goes at once; a repeating one asks which days
export function useDeleteTask() {
  const { getTask, seriesFor, deleteTask } = useStore();
  const [asking, setAsking] = useState<string | null>(null);

  const run = (id: string, what: 'one' | 'all' | Span, message: string) => {
    const undo = deleteTask(id, what);
    setAsking(null);
    showToast({ message, action: { label: 'Undo', onPress: undo } });
  };

  const ask = (id: string) => {
    const task = getTask(id);
    if (!task) return;
    if (seriesFor(task)) setAsking(id);
    else run(id, 'one', 'Task deleted');
  };

  const task = asking ? getTask(asking) : null;
  const series = task && seriesFor(task);
  const prompt = task && series ? (
    <DeletePrompt
      key={task.id}
      task={task}
      series={series}
      onDelete={(what, message) => run(task.id, what, message)}
      onClose={() => setAsking(null)}
    />
  ) : null;

  return { ask, prompt };
}

function DeletePrompt({
  task, series, onDelete, onClose,
}: {
  task: Task;
  series: Task;
  onDelete: (what: 'one' | 'all' | Span, message: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const { seriesRange, spanDays } = useStore();
  const range = seriesRange(series);
  const [choosing, setChoosing] = useState(false);
  // starts as "this and every later day"
  const [span, setSpan] = useState<Span>({ from: task.occursOn!, to: null });
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const count = spanDays(task, span);
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const last = span.to ?? range.last;
  const summary =
    count === 0 ? 'No unfinished days in that span.'
    : last === null ? `Removes every day from ${shortDay(span.from)} onward.`
    : `Removes ${days(count!)}, ${shortDay(span.from)} to ${shortDay(last)}.`;

  const pick = (day: string) => {
    setSpan(s => (picking === 'from'
      ? { from: day, to: s.to !== null && s.to < day ? day : s.to }
      : { ...s, to: day }));
    setPicking(null);
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', padding: space(2) }}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Cancel"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        />
        <View style={{
          backgroundColor: t.bg, borderWidth: 2, borderColor: t.hairline, maxHeight: '85%',
        }}>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space(2), gap: space(1.5) }}>
            {choosing ? (
              <>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Delete which days?</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Muted style={{ fontSize: 12, width: 44 }}>From</Muted>
                  <ChoiceChip
                    label={shortDay(span.from)}
                    active
                    onPress={() => setPicking(p => (p === 'from' ? null : 'from'))}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Muted style={{ fontSize: 12, width: 44 }}>To</Muted>
                  <ChoiceChip
                    label="End of series"
                    active={span.to === null}
                    onPress={() => { setPicking(null); setSpan(s => ({ ...s, to: null })); }}
                  />
                  <ChoiceChip
                    label={span.to ? shortDay(span.to) : 'On a date…'}
                    active={span.to !== null}
                    onPress={() => setPicking(p => (p === 'to' ? null : 'to'))}
                  />
                </View>
                {picking && (
                  <View style={{ marginHorizontal: -space(2) }}>
                    <MonthCalendar
                      key={picking}
                      selected={picking === 'from' ? span.from : span.to ?? span.from}
                      min={picking === 'from' ? range.first : span.from}
                      onPick={pick}
                    />
                  </View>
                )}

                <Muted style={{ fontSize: 12 }}>{summary} Completed days stay.</Muted>
                <AccentButton
                  label="Delete these days"
                  disabled={count === 0}
                  onPress={() => onDelete(span, count === null ? 'Days deleted' : `${days(count)} deleted`)}
                />
                <Pressable
                  onPress={() => { setPicking(null); setChoosing(false); }}
                  style={{ alignItems: 'center', paddingVertical: space(1) }}
                >
                  <Muted style={{ fontSize: 13 }}>Back</Muted>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }} numberOfLines={2}>
                  {`Delete "${task.text}"?`}
                </Text>
                <Muted style={{ fontSize: 12 }}>
                  {`Repeats · ${repeatLabel(series.repeatDays!, range.last)}`}
                </Muted>
                <GhostButton label="Only this day" onPress={() => onDelete('one', 'Day deleted')} />
                <GhostButton label="A span of days" onPress={() => setChoosing(true)} />
                <GhostButton label="All series" onPress={() => onDelete('all', 'Series deleted')} />
                <Muted style={{ fontSize: 12 }}>All series also removes past and completed days.</Muted>
                <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: space(1) }}>
                  <Muted style={{ fontSize: 13 }}>Cancel</Muted>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
