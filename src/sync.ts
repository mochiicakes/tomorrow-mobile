import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Task, Settings } from './store';

const CURSOR = 'tomorrow.sync.cursor';
const PAGE = 1000;

// cursor
async function getCursor(): Promise<string | null> {
  return AsyncStorage.getItem(CURSOR);
}

async function setCursor(v: string) {
  await AsyncStorage.setItem(CURSOR, v);
}

export async function hasCursor(): Promise<boolean> {
  return (await getCursor()) !== null;
}

// rows
function fromRow(r: any): Task {
  return {
    id: r.id,
    text: r.text,
    day: r.day,
    done: r.done,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : null,
    dirty: false,
  };
}

// push - updated_at is set by the server trigger
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
    deleted_at: t.deletedAt ? new Date(t.deletedAt).toISOString() : null,
  }));

  const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn('[tomorrow] push failed', error.message);
    return false;
  }
  return true;
}

export async function pushSettings(userId: string, s: Settings): Promise<boolean> {
  if (!supabase) return false;
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
  if (error) {
    console.warn('[tomorrow] settings push failed', error.message);
    return false;
  }
  return true;
}

export async function pullSettings(): Promise<Partial<Settings> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('settings').select('*').maybeSingle();
  if (error) {
    console.warn('[tomorrow] settings pull failed', error.message);
    return null;
  }
  if (!data) return null;
  return {
    skin: data.skin,
    hour: data.hour,
    minute: data.minute,
    notificationsOn: data.notifications_on,
  };
}

// pull - everything on first run, changes since the cursor after that
export async function pullTasks(): Promise<Task[] | null> {
  if (!supabase) return null;
  const since = await getCursor();
  const out: Task[] = [];
  let last: string | null = null;

  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (since) q = q.gt('updated_at', since);

    const { data, error } = await q;
    if (error) {
      console.warn('[tomorrow] pull failed', error.message);
      return null;
    }
    if (!data?.length) break;
    data.forEach(r => out.push(fromRow(r)));
    last = data[data.length - 1].updated_at;
    if (data.length < PAGE) break;
  }

  if (last) await setCursor(last);
  return out;
}

// merge - unsynced local edits win, otherwise the server copy wins
export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const byId = new Map(local.map(t => [t.id, t]));
  remote.forEach(r => {
    const mine = byId.get(r.id);
    if (!mine || !mine.dirty) byId.set(r.id, r);
  });
  return Array.from(byId.values());
}
