import React, { useState } from 'react';
import { View, FlatList, Pressable, Keyboard, Platform } from 'react-native';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { Card, Check, Muted } from './ui';
import { Text } from '../src/Txt';
import { TaskSheet } from './TaskSheet';
import { AddTask } from './AddTask';
import { useDeleteTask } from './DeletePrompt';
import { PixelIcon, ICONS } from './PixelIcon';
import { formatTime } from './dates';
import { repeatLabel } from './RepeatPicker';

// list
export function DayList({ day, placeholder }: { day: string; placeholder: string }) {
  const t = useTheme();
  const { tasksFor, toggleTask, seriesFor, seriesRange } = useStore();
  const del = useDeleteTask();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const items = tasksFor(day);

  // the window has to be gone before the delete question can open over the list
  const deleteFromSheet = (id: string) => {
    setOpen(null);
    setTimeout(() => del.ask(id), Platform.OS === 'ios' ? 400 : 0);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space(2), paddingBottom: space(1.5) }}>
        {/* opens the add window; drawn like a field */}
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a task"
          style={({ pressed }) => ({
            backgroundColor: t.raised,
            paddingHorizontal: space(2.5),
            paddingVertical: 16,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: t.muted, fontSize: 16 }}>{placeholder}</Text>
        </Pressable>
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
        renderItem={({ item }) => {
          const series = seriesFor(item);
          return (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Check done={item.done} onPress={() => toggleTask(item.id)} />
            {/* tap the text to edit the task */}
            <Pressable
              onPress={() => { Keyboard.dismiss(); setOpen(item.id); }}
              style={{ flex: 1, gap: 4 }}
              accessibilityRole="button"
              accessibilityHint="Edit this task"
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
              {item.details !== '' && (
                <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={2}>{item.details}</Text>
              )}
              {series && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PixelIcon grid={ICONS.repeat} color={item.done ? t.muted : t.eye} size={10} />
                  <Text style={{ color: t.muted, fontSize: 11, flexShrink: 1 }}>
                    {repeatLabel(series.repeatDays!, seriesRange(series).last)}
                  </Text>
                </View>
              )}
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
              onPress={() => del.ask(item.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.text}`}
            >
              <Text style={{ color: t.muted, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </Card>
          );
        }}
      />

      {adding && <AddTask day={day} onClose={() => setAdding(false)} />}
      <TaskSheet taskId={open} onClose={() => setOpen(null)} onDelete={deleteFromSheet} />
      {del.prompt}
    </View>
  );
}
