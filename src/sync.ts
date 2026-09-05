import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Task, Settings } from './store';

const CURSOR = 'tomorrow.sync.cursor';

// cursor
async function getCursor(): Promise<string> {
  return (await AsyncStorage.getItem(CURSOR)) ?? '1970-01-01T00:00:00Z';
}

async function setCursor(v: string) {
  await AsyncStorage.setItem(CURSOR, v);
}

// push
export async function pushTasks(userId: string, tasks: Task[]): Promise<boolean> {
  if (!supabase) return false;
  if (!tasks.length) return true;

  const rows = tasks.map(t => ({
    id: t.id,
    user_id: userId,
    text: t.text,
    day: t.day,
    done: t.done,
    created_at: new Date(t.createdAt).toISOString(),
    updated_at: new Date(t.updatedAt).toISOString(),
    deleted_at: t.deletedAt ? new Date(t.deletedAt).toISOString() : null,
  }));

  const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn('[tomorrow] push failed', error.message);
    return false;
  }
  return true;
}

export async function pushSettings(userId: string, s: Settings) {
  const { error } = await supabase.from('settings').upsert(
    {
      user_id: userId,
      skin: s.skin,
      hour: s.hour,
      minute: s.minute,
      notifications_on: s.notificationsOn,
    },
    { onConflict: 'user_id' },
  );
  if (error) console.warn('[tomorrow] settings push failed', error.message);
}

// pull all - fetch everything (for old logs under 'later')
export async function pullAllTasks(): Promise<Task[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('updated_at', { ascending: true });

  if (error) {
    console.warn('[tomorrow] full pull failed', error.message);
    return null;
  }
  if (data?.length) await setCursor(data[data.length - 1].updated_at);
  return data.map(r => ({
    id: r.id,
    text: r.text,
    day: r.day,
    done: r.done,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : null,
  }));
}

// pull - steady state call
export async function pullTasks(): Promise<Task[] | null> {
  const since = await getCursor();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true });

  if (error) {
    console.warn('[tomorrow] pull failed', error.message);
    return null;
  }
  if (!data?.length) return [];

  await setCursor(data[data.length - 1].updated_at);

  return data.map(r => ({
    id: r.id,
    text: r.text,
    day: r.day,
    done: r.done,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : null,
  }));
}

// merge
export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const byId = new Map(local.map(t => [t.id, t]));
  remote.forEach(r => {
    const mine = byId.get(r.id);
    if (!mine || r.updatedAt > mine.updatedAt) byId.set(r.id, r);
  });
  return Array.from(byId.values());
}
