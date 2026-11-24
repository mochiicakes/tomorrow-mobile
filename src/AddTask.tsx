import React, { useRef, useState } from 'react';
import { View, Pressable, Keyboard, type TextInput } from 'react-native';
import { useStore } from './store';
import { useTheme, space } from './theme';
import { AccentButton, Muted } from './ui';
import { Text } from './Txt';
import { TaskWindow } from './TaskWindow';
import { TaskFields, type TaskDraft } from './TaskFields';
import { showToast } from './toast';
import { prettyDay } from './dates';
import { repeatValid } from './recurrence';

// window - a new task with every option
export function AddTask({ day, onClose }: { day: string; onClose: () => void }) {
  const t = useTheme();
  const { addTask } = useStore();
  const blank: TaskDraft = { text: '', details: '', day, remindAt: null, repeat: null };
  const [draft, setDraft] = useState(blank);
  // bumped after "Add another" so every row folds again
  const [round, setRound] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const title = useRef<TextInput>(null);

  const repeatOk = !draft.repeat || repeatValid(draft.repeat, draft.day);
  const canAdd = draft.text.trim() !== '' && repeatOk;
  const dirty = draft.text.trim() !== '' || draft.details.trim() !== '' ||
    draft.day !== day || draft.remindAt !== null || draft.repeat !== null;

  const add = () => addTask(draft.text, draft.day, {
    details: draft.details, remindAt: draft.remindAt, repeat: draft.repeat,
  });

  const save = () => {
    const first = add();
    Keyboard.dismiss();
    onClose();
    if (first && first !== day) showToast(`Added. First on ${prettyDay(first)}`);
  };

  // stays open for the next one; a toast would be hidden behind the window
  const another = () => {
    const first = add();
    setNote(`Added "${draft.text.trim()}"${first && first !== day ? ` · ${prettyDay(first)}` : ''}`);
    setDraft(blank);
    setRound(n => n + 1);
    // after the remount
    setTimeout(() => title.current?.focus(), 50);
  };

  return (
    <TaskWindow
      title="New task"
      dirty={dirty}
      onClose={onClose}
      // Android ignores autoFocus inside a Modal
      onShow={() => setTimeout(() => title.current?.focus(), 100)}
      footer={
        <View style={{ gap: space(0.5) }}>
          {note && <Muted style={{ fontSize: 12, textAlign: 'center' }}>{note}</Muted>}
          <AccentButton label="Add task" onPress={save} disabled={!canAdd} />
          <Pressable
            onPress={another}
            disabled={!canAdd}
            style={{ alignItems: 'center', paddingVertical: space(1), opacity: canAdd ? 1 : 0.4 }}
          >
            <Text style={{ color: t.text, fontSize: 13 }}>Add another</Text>
          </Pressable>
        </View>
      }
    >
      <TaskFields
        key={round}
        draft={draft}
        onChange={patch => setDraft(d => ({ ...d, ...patch }))}
        titleRef={title}
        repeatFrom={draft.day}
        repeatOk={repeatOk}
      />
    </TaskWindow>
  );
}
