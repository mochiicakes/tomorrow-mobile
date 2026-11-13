import React, { useState } from 'react';
import { View, FlatList, Pressable, Keyboard } from 'react-native';
import { useStore, MAX_TASK_LENGTH } from './store';
import { useTheme, space } from './theme';
import { Card, Check, Field, Muted } from './ui';
import { Text } from '../src/Txt';
import { showToast } from './toast';
import { TaskSheet } from './TaskSheet';
import { PixelIcon, ICONS } from './PixelIcon';
import { formatTime } from './dates';

// list
export function DayList({ day, placeholder }: { day: string; placeholder: string }) {
  const t = useTheme();
  const { tasksFor, addTask, toggleTask, removeTask, restoreTask } = useStore();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const items = tasksFor(day);

  const submit = () => {
    addTask(draft, day);
    setDraft('');
  };

  const remove = (id: string) => {
    removeTask(id);
    showToast({ message: 'Task deleted', action: { label: 'Undo', onPress: () => restoreTask(id) } });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space(2), paddingBottom: space(1.5) }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          maxLength={MAX_TASK_LENGTH}
          returnKeyType="done"
          onSubmitEditing={submit}
          blurOnSubmit={false}
        />
      </View>

      {/* rows */}
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={{ paddingHorizontal: space(2), paddingBottom: space(6), gap: 10 }}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', paddingVertical: space(4) }}>
            <Muted>Nothing here yet.</Muted>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Check done={item.done} onPress={() => toggleTask(item.id)} />
            {/* tap the text to move the task or set a reminder */}
            <Pressable
              onPress={() => { Keyboard.dismiss(); setOpen(item.id); }}
              style={{ flex: 1, gap: 4 }}
              accessibilityRole="button"
              accessibilityHint="Move to another day or set a reminder"
            >
              <Text
                style={{
                  color: item.done ? t.muted : t.text,
                  fontSize: 16,
                  textDecorationLine: item.done ? 'line-through' : 'none',
                }}
              >
                {item.text}
              </Text>
              {item.remindAt && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PixelIcon grid={ICONS.bell} color={item.done ? t.muted : t.eye} size={10} />
                  <Text style={{ color: t.muted, fontSize: 11 }}>
                    {formatTime(...(item.remindAt.split(':').map(Number) as [number, number]))}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => remove(item.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.text}`}
            >
              <Text style={{ color: t.muted, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </Card>
        )}
      />

      <TaskSheet taskId={open} onClose={() => setOpen(null)} />
    </View>
  );
}
