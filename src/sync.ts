import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Task, Settings, CustomCat } from './store';
import { warn } from './log';

const CURSOR = 'tomorrow.sync.cursor';
const CATS_CURSOR = 'tomorrow.sync.cats.cursor';
const PAGE = 1000;

// cursor
async function getCursor(key = CURSOR): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

async function setCursor(key: string, v: string) {
  await AsyncStorage.setItem(key, v);
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
    remindAt: r.remind_at ?? null,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : null,
    dirty: false,
  };
}

function catFromRow(r: any): CustomCat {
  return {
    id: r.id,
    name: r.name,
    coat: r.coat,
    eye: r.eye,
    backdrop: r.backdrop,
    pixels: r.pixels ?? [],
    palette: r.palette ?? [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : null,
    dirty: false,
  };
}

// Postgres class 22 (bad data) and 23 (constraint) errors won't fix themselves on retry
const isPermanent = (code?: string) => Boolean(code && /^2[23]/.test(code));

export type PushResult = { pushed: string[]; rejected: string[] };

// push - updated_at is set by the server trigger. Returns null when the whole
// push failed (offline, server down) and should be retried later.
async function upsertRows<T extends { id: string }>(
  table: string,
  rows: T[],
  toRow: (r: T) => object,
): Promise<PushResult | null> {
  if (!supabase) return null;
  if (!rows.length) return { pushed: [], rejected: [] };

  const { error } = await supabase.from(table).upsert(rows.map(toRow), { onConflict: 'id' });
  if (!error) return { pushed: rows.map(r => r.id), rejected: [] };
  warn(`${table} push failed`, error.code, error.message);
  if (!isPermanent(error.code)) return null;

  // One bad row fails the whole batch. Send rows one by one so the good ones
  // land and the bad ones stop blocking every future sync.
  const out: PushResult = { pushed: [], rejected: [] };
  for (const r of rows) {
    const { error: e } = await supabase.from(table).upsert(toRow(r), { onConflict: 'id' });
    if (!e) out.pushed.push(r.id);
    else if (isPermanent(e.code)) out.rejected.push(r.id);
    else return out.pushed.length ? out : null;
  }
  return out;
}

export function pushTasks(userId: string, tasks: Task[]) {
  return upsertRows('tasks', tasks, t => ({
    id: t.id,
    user_id: userId,
    text: t.text,
    day: t.day,
    done: t.done,
    remind_at: t.remindAt,
    created_at: new Date(t.createdAt).toISOString(),
    deleted_at: t.deletedAt ? new Date(t.deletedAt).toISOString() : null,
  }));
}

export function pushCustomCats(userId: string, cats: CustomCat[]) {
  return upsertRows('custom_cats', cats, c => ({
    id: c.id,
    user_id: userId,
    name: c.name,
    coat: c.coat,
    eye: c.eye,
    backdrop: c.backdrop,
    pixels: c.pixels,
    palette: c.palette,
    created_at: new Date(c.createdAt).toISOString(),
    deleted_at: c.deletedAt ? new Date(c.deletedAt).toISOString() : null,
  }));
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
    warn('settings push failed', error.message);
    return false;
  }
  return true;
}

export async function pullSettings(): Promise<Partial<Settings> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('settings').select('*').maybeSingle();
  if (error) {
    warn('settings pull failed', error.message);
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
async function pullRows<T>(
  table: string,
  cursorKey: string,
  fromRowFn: (r: any) => T,
): Promise<T[] | null> {
  if (!supabase) return null;
  const since = await getCursor(cursorKey);
  const out: T[] = [];
  let last: string | null = null;

  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from(table)
      .select('*')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (since) q = q.gt('updated_at', since);

    const { data, error } = await q;
    if (error) {
      warn(`${table} pull failed`, error.message);
      return null;
    }
    if (!data?.length) break;
    data.forEach(r => out.push(fromRowFn(r)));
    last = data[data.length - 1].updated_at;
    if (data.length < PAGE) break;
  }

  if (last) await setCursor(cursorKey, last);
  return out;
}

export const pullTasks = () => pullRows('tasks', CURSOR, fromRow);
export const pullCustomCats = () => pullRows('custom_cats', CATS_CURSOR, catFromRow);

// merge - unsynced local edits win, otherwise the server copy wins
export function mergeRows<T extends { id: string; dirty: boolean }>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map(t => [t.id, t]));
  remote.forEach(r => {
    const mine = byId.get(r.id);
    if (!mine || !mine.dirty) byId.set(r.id, r);
  });
  return Array.from(byId.values());
}

export const mergeTasks = (local: Task[], remote: Task[]) => mergeRows(local, remote);
