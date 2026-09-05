import React, { useState } from 'react';
import { View, FlatList, Pressable, Keyboard } from 'react-native';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { Card, Check, Field, Muted } from './ui';
import { Text } from '../src/Txt';

// list
export function DayList({ day, placeholder }: { day: string; placeholder: string }) {
  const t = useTheme();
  const { tasksFor, addTask, toggleTask, removeTask } = useStore();
  const [draft, setDraft] = useState('');
  const items = tasksFor(day);

  const submit = () => {
    addTask(draft, day);
    setDraft('');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space(2), paddingBottom: space(1.5) }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
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
            <Text
              style={{
                flex: 1,
                color: item.done ? t.muted : t.text,
                fontSize: 16,
                textDecorationLine: item.done ? 'line-through' : 'none',
              }}
            >
              {item.text}
            </Text>
            <Pressable onPress={() => removeTask(item.id)} hitSlop={10}>
              <Text style={{ color: t.muted, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}
