import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useStore, type Task } from './store';
import { space } from './theme';
import { Muted, AccentButton } from './ui';
import { Text } from './Txt';
import { TaskWindow } from './TaskWindow';
import { TaskFields, type TaskDraft } from './TaskFields';
import { showToast, DANGER } from './toast';
import { prettyDay, shortDay } from './dates';
import { repeatValid, type Repeat, type Scope, type TaskEdit } from './recurrence';

// sheet - edit a task; nothing is stored until Save
export function TaskSheet({
  taskId, onClose, onDelete,
}: {
  taskId: string | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { getTask, seriesFor } = useStore();
  const task = taskId ? getTask(taskId) : null;
  if (!task) return null;
  return (
    <Editor key={task.id} task={task} series={seriesFor(task)} onClose={onClose} onDelete={() => onDelete(task.id)} />
  );
}

function Editor({
  task, series, onClose, onDelete,
}: {
  task: Task;
  series: Task | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { canExtend, seriesRange, updateTask } = useStore();

  // what the window opened with, so a sync meanwhile can't look like an edit
  const [was] = useState(() => ({
    task,
    repeat: series ? { days: series.repeatDays!, until: series.repeatUntil } as Repeat : null,
  }));
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    text: task.text, details: task.details, day: task.day, remindAt: task.remindAt, repeat: was.repeat,
  }));
  const { text, details, day, remindAt, repeat } = draft;
  const inSeries = was.repeat !== null;

  // changes
  const daysChanged = !!repeat && !!was.repeat && repeat.days.join() !== was.repeat.days.join();
  const untilChanged = !!repeat && !!was.repeat && repeat.until !== was.repeat.until;
  const ruleChanged = daysChanged || untilChanged;
  const repeatChanged = ruleChanged || !repeat !== !was.repeat;
  const edit: TaskEdit = {
    ...(text.trim() !== was.task.text && { text }),
    ...(details.trim() !== was.task.details && { details }),
    ...(day !== was.task.day && { day }),
    ...(remindAt !== was.task.remindAt && { remindAt }),
    ...(repeatChanged && { repeat }),
  };
  const dirty = Object.keys(edit).length > 0;
  const untilOnly = untilChanged && !daysChanged && Object.keys(edit).length === 1;

  // a series' rule applies from the day this copy stands for
  const from = was.repeat ? was.task.occursOn! : day;
  const untilLocked = series !== null && !canExtend(series);
  const repeatOk = !repeat || !repeatChanged ||
    repeatValid(untilLocked ? { ...repeat, until: null } : repeat, from);
  const canSave = text.trim() !== '' && repeatOk;

  // scope - which saves make sense for a repeating task
  const asksScope = inSeries && repeat !== null && !untilOnly;
  const canSaveOne = !ruleChanged;
  const canSaveFollowing = day === was.task.day;
  const last = repeat && untilChanged ? repeat.until : series ? seriesRange(series).last : null;

  const change = (patch: Partial<TaskDraft>) => setDraft(d => ({
    ...d,
    ...patch,
    // a new rule can't be combined with moving this one day
    ...(inSeries && patch.repeat && { day: was.task.day }),
  }));

  const save = (scope: Scope) => {
    const undo = updateTask(task.id, edit, scope);
    onClose();
    showToast({
      message: edit.day !== undefined && (!repeat || inSeries) ? `Moved to ${prettyDay(day)}` : 'Saved',
      action: { label: 'Undo', onPress: undo },
    });
  };

  const footer = !dirty ? null : (
    <View style={{ gap: space(1) }}>
      {text.trim() === '' && (
        <Text style={{ color: DANGER, fontSize: 12, textAlign: 'center' }}>A task needs some text.</Text>
      )}
      {asksScope ? (
        <>
          {canSaveOne && (
            <View style={{ gap: 4 }}>
              <AccentButton label="Save this day" onPress={() => save('one')} disabled={!canSave} />
              <Muted style={{ fontSize: 11, textAlign: 'center' }}>{shortDay(day)}</Muted>
            </View>
          )}
          {canSaveFollowing && (
            <View style={{ gap: 4 }}>
              <AccentButton label="Save this + future days" onPress={() => save('following')} disabled={!canSave} />
              <Muted style={{ fontSize: 11, textAlign: 'center' }}>
                {last ? `${shortDay(from)} to ${shortDay(last)}` : `${shortDay(from)} onward`}
              </Muted>
            </View>
          )}
        </>
      ) : (
        <AccentButton label="Save" onPress={() => save('one')} disabled={!canSave} />
      )}
    </View>
  );

  return (
    <TaskWindow title="Task" dirty={dirty} onClose={onClose} footer={footer}>
      <TaskFields
        draft={draft}
        onChange={change}
        repeatFrom={from}
        repeatOk={repeatOk}
        wasRepeat={was.repeat}
        untilLocked={untilLocked}
        dayLocked={inSeries && ruleChanged}
      />
      <Pressable onPress={onDelete} style={{ alignItems: 'center', paddingVertical: space(1.5) }}>
        <Text style={{ color: DANGER, fontSize: 13 }}>{inSeries ? 'Delete…' : 'Delete task'}</Text>
      </Pressable>
    </TaskWindow>
  );
}
