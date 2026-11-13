import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, Platform, ScrollView } from 'react-native';
import { TimePicker } from './TimePicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { Muted, AccentButton } from './ui';
import { Text } from './Txt';
import { Toggle } from './controls';
import { MonthCalendar } from './MonthPicker';
import { showToast, DANGER } from './toast';
import { prettyDay, formatTime, atTime } from './dates';

const pad = (n: number) => String(n).padStart(2, '0');

// default reminder - the next full hour when the task is today, else 9 AM
function defaultReminder(day: string, today: string): string {
  if (day !== today) return '09:00';
  const h = Math.min(new Date().getHours() + 1, 23);
  return `${pad(h)}:00`;
}

function Chip({ label, onPress, active = false }: { label: string; onPress: () => void; active?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      style={({ pressed }) => ({
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 2,
        borderColor: active ? t.eye : t.hairline,
        backgroundColor: active ? t.eye : pressed ? t.raised : t.surface,
      })}
    >
      <Text style={{ fontSize: 13, color: active ? t.onAccent : t.text }}>{label}</Text>
    </Pressable>
  );
}

// sheet - move a task to another day and set its optional reminder
export function TaskSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { tasks, today, tomorrow, moveTask, setReminder, removeTask, restoreTask } = useStore();
  const task = tasks.find(x => x.id === taskId) ?? null;
  const [picking, setPicking] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // fresh state each time the sheet opens
  useEffect(() => {
    setPicking(false);
    setShowTime(false);
  }, [taskId]);

  if (!task) return null;

  const move = (day: string) => {
    const from = task.day;
    if (day === from) return;
    moveTask(task.id, day);
    onClose();
    showToast({
      message: `Moved to ${prettyDay(day)}`,
      action: { label: 'Undo', onPress: () => moveTask(task.id, from) },
    });
  };

  const remove = () => {
    removeTask(task.id);
    onClose();
    showToast({ message: 'Task deleted', action: { label: 'Undo', onPress: () => restoreTask(task.id) } });
  };

  const toggleReminder = (on: boolean) => {
    if (!on) {
      setReminder(task.id, null);
      setShowTime(false);
      return;
    }
    setReminder(task.id, defaultReminder(task.day, today));
    setShowTime(true);
  };

  const [h, m] = (task.remindAt ?? '09:00').split(':').map(Number);
  const passed = task.remindAt !== null && atTime(task.day, task.remindAt) <= Date.now();

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.bg,
            borderTopWidth: 2,
            borderColor: t.hairline,
            maxHeight: '90%',
          }}
        >
          <ScrollView
            contentContainerStyle={{
              padding: space(2),
              paddingBottom: space(3) + insets.bottom,
              gap: space(2),
            }}
          >
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }} numberOfLines={3}>
              {task.text}
            </Text>

            {/* move */}
            <View style={{ gap: space(1) }}>
              <Muted>Move to · now {prettyDay(task.day)}</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Today" active={task.day === today} onPress={() => move(today)} />
                <Chip label="Tomorrow" active={task.day === tomorrow} onPress={() => move(tomorrow)} />
                <Chip label={picking ? 'Hide calendar' : 'Pick a date…'} onPress={() => setPicking(p => !p)} />
              </View>
              {picking && (
                <View style={{ marginHorizontal: -space(2) }}>
                  <MonthCalendar selected={task.day} onPick={move} />
                </View>
              )}
            </View>

            {/* reminder */}
            <View style={{ gap: space(1) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Remind me</Text>
                <Toggle value={task.remindAt !== null} onValueChange={toggleReminder} />
              </View>
              {task.remindAt !== null && (
                <>
                  <Pressable
                    onPress={() => setShowTime(s => (Platform.OS === 'android' ? true : !s))}
                    style={{ backgroundColor: t.raised, padding: space(1.5), alignItems: 'center' }}
                  >
                    <Text style={{ color: t.accent, fontSize: 22, fontWeight: '700' }}>
                      {formatTime(h, m)}
                    </Text>
                    <Muted style={{ fontSize: 12 }}>on {prettyDay(task.day)} · tap to change</Muted>
                  </Pressable>
                  {passed && <Muted style={{ fontSize: 12 }}>That time has already passed.</Muted>}
                  {showTime && (
                    <TimePicker
                      hour={h}
                      minute={m}
                      onChange={(hh, mm) => setReminder(task.id, `${pad(hh)}:${pad(mm)}`)}
                      onClose={() => setShowTime(false)}
                    />
                  )}
                </>
              )}
            </View>

            <AccentButton label="Done" onPress={onClose} />
            <Pressable onPress={remove} style={{ alignItems: 'center', paddingVertical: space(1) }}>
              <Text style={{ color: DANGER, fontSize: 13 }}>Delete task</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
