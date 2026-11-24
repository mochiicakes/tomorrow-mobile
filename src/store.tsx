import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { todayKey, tomorrowKey, msUntilMidnight, atTime } from './dates';
import {
  activeSeries, cleanDays, continuations, deleteAll, deleteSpan, editFollowing, editOne, endFollowing,
  firstMatch, indexTasks, makeSeries, repeatValid, resolve, revert, seriesRange, setUntil, spanDays,
  tasksOn, touch, upcomingReminders, upsert,
  type Repeat, type Scope, type Span, type TaskEdit,
} from './recurrence';
import {
  scheduleDailyNudge, scheduleTaskReminders, requestPermission, nativeAlarmsAvailable, openAppSettings,
  type NudgeResult, type Reminder,
} from './notifications';
import { configureNativeSpotify, MIN_CLIP_MS, MAX_CLIP_MS } from './spotify';
import TomorrowAlarm from '../modules/tomorrow-alarm';
import { SKINS, skinEye, customSkinId } from './theme';
import { useAuth } from './auth';
import {
  pushTasks, pushSettings, pullTasks, pullSettings, hasCursor, mergeTasks,
  pushCustomCats, pullCustomCats, mergeRows, type PushResult,
} from './sync';
import { isHex } from './color';
import { CAT_GRID_AWAKE } from './Cat';
import { warn } from './log';

const KEY = 'tomorrow.state.v3';
const CORRUPT = 'tomorrow.state.corrupt';
const LEGACY_PUSHED = 'tomorrow.pushedAt';
export const MAX_TASK_LENGTH = 500;
export const MAX_DETAILS_LENGTH = 2000;
// days of repeating reminders to schedule ahead
const REMINDER_WINDOW = 60;
export const MAX_CAT_NAME = 24;
export const MAX_CAT_COLORS = 10;

// types
export type Task = {
  id: string;
  text: string;
  // optional notes, '' when empty
  details: string;
  day: string;
  done: boolean;
  // 'HH:MM' local time on `day`, or null for no reminder
  remindAt: string | null;
  // set on series rows only: ticked weekdays (0 = Sunday), and the last day if it ends
  repeatDays: number[] | null;
  repeatUntil: string | null;
  // on one day of a series: which series, and the day it stands for (kept when moved).
  // On a series split off by an edit, seriesId is the series it continues.
  seriesId: string | null;
  occursOn: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  // local only: changed since the last successful push
  dirty: boolean;
  // local only: the server refused this row for good; kept here, not retried
  rejected?: boolean;
};

// custom cat - pixels use the PATTERNS format: '.' = base coat, 'a'..'j' = palette[0..9]
export type CustomCat = {
  id: string;
  name: string;
  coat: string;
  eye: string;
  // preset skin id whose bg/surface/text colours the app borrows
  backdrop: string;
  pixels: string[];
  palette: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  dirty: boolean;
  rejected?: boolean;
};

export type CustomCatDraft = Pick<CustomCat, 'name' | 'coat' | 'eye' | 'backdrop' | 'pixels' | 'palette'> & {
  id?: string;
};

// a Spotify clip that rings for alarms - device-local, never synced
export type AlarmSound = {
  uri: string;
  name: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number;
  startMs: number;
  endMs: number;
};

export type Settings = {
  skin: string;
  hour: number;
  minute: number;
  notificationsOn: boolean;
  lastPromptedFor: string | null;
  alarmSound: AlarmSound | null;
};

type State = { tasks: Task[]; customCats: CustomCat[]; settings: Settings; settingsDirty: boolean };

const SYNCED_SETTINGS: (keyof Settings)[] = ['skin', 'hour', 'minute', 'notificationsOn'];

const DEFAULT: State = {
  tasks: [],
  customCats: [],
  settings: {
    skin: 'mono',
    hour: 20,
    minute: 30,
    notificationsOn: true,
    lastPromptedFor: null,
    alarmSound: null,
  },
  settingsDirty: false,
};

type AddExtra = { details?: string; remindAt?: string | null; repeat?: Repeat | null };

type Store = {
  ready: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  unsyncedCount: number;
  nudgeStatus: NudgeResult | null;
  tasks: Task[];
  customCats: CustomCat[];
  settings: Settings;
  today: string;
  tomorrow: string;
  tasksFor: (day: string) => Task[];
  getTask: (id: string) => Task | null;
  seriesFor: (t: Task) => Task | null;
  // false when a later edit already carries the series on past its end date
  canExtend: (series: Task) => boolean;
  // the whole repeating task, across every stretch; last is null if it never ends
  seriesRange: (series: Task) => { first: string; last: string | null };
  // unfinished days a span would delete; null = it never ends
  spanDays: (t: Task, span: Span) => number | null;
  saveCustomCat: (draft: CustomCatDraft) => string;
  deleteCustomCat: (id: string) => void;
  // returns the first day it lands on, or null if nothing was added
  addTask: (text: string, day: string, extra?: AddExtra) => string | null;
  // both return an undo
  updateTask: (id: string, e: TaskEdit, scope: Scope) => () => void;
  deleteTask: (id: string, what: 'one' | 'all' | Span) => () => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  restoreTask: (id: string) => void;
  moveTask: (id: string, day: string) => void;
  setReminder: (id: string, remindAt: string | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  enableNudge: (opts?: { explain?: boolean }) => void;
  shouldPrompt: boolean;
  dismissPrompt: () => void;
  forcePrompt: () => void;
  syncNow: () => Promise<boolean>;
};

const StoreContext = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(StoreContext);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const REMIND_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// load - keeps only well-formed tasks from whatever was on disk
function sanitizeTasks(raw: unknown, legacy: boolean): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Partial<Task> =>
      t && typeof t.id === 'string' && typeof t.text === 'string' && DAY_RE.test(t.day))
    .map(t => ({
      id: t.id!,
      text: t.text!.slice(0, MAX_TASK_LENGTH),
      details: typeof t.details === 'string' ? t.details.slice(0, MAX_DETAILS_LENGTH) : '',
      day: t.day!,
      done: Boolean(t.done),
      remindAt: typeof t.remindAt === 'string' && REMIND_RE.test(t.remindAt) ? t.remindAt : null,
      repeatDays: cleanDays(t.repeatDays),
      repeatUntil: typeof t.repeatUntil === 'string' && DAY_RE.test(t.repeatUntil) ? t.repeatUntil : null,
      seriesId: typeof t.seriesId === 'string' ? t.seriesId : null,
      occursOn: typeof t.occursOn === 'string' && DAY_RE.test(t.occursOn) ? t.occursOn : null,
      createdAt: Number(t.createdAt) || Date.now(),
      updatedAt: Number(t.updatedAt ?? t.createdAt) || Date.now(),
      deletedAt: t.deletedAt ?? null,
      dirty: legacy || t.dirty === undefined ? true : Boolean(t.dirty),
      rejected: t.rejected || undefined,
    }));
}

const PIXEL_ROW_RE = new RegExp(`^[.a-j]{${CAT_GRID_AWAKE[0].length}}$`);

export const isPixelGrid = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length === CAT_GRID_AWAKE.length &&
  v.every(r => typeof r === 'string' && PIXEL_ROW_RE.test(r));

// load - keeps only well-formed custom cats
function sanitizeCustomCats(raw: unknown): CustomCat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Partial<CustomCat> =>
      c && typeof c.id === 'string' && isHex(c.coat) && isHex(c.eye) && isPixelGrid(c.pixels))
    .map(c => ({
      id: c.id!,
      name: (typeof c.name === 'string' && c.name.trim().slice(0, MAX_CAT_NAME)) || 'My cat',
      coat: c.coat!,
      eye: c.eye!,
      // a hex colour, or a preset skin id on cats made before the backdrop grid
      backdrop: isHex(c.backdrop) || SKINS.some(s => s.id === c.backdrop) ? c.backdrop! : '#FFFFFF',
      pixels: c.pixels!,
      palette: Array.isArray(c.palette) ? c.palette.filter(isHex).slice(0, MAX_CAT_COLORS) : [],
      createdAt: Number(c.createdAt) || Date.now(),
      updatedAt: Number(c.updatedAt ?? c.createdAt) || Date.now(),
      deletedAt: c.deletedAt ?? null,
      dirty: c.dirty === undefined ? true : Boolean(c.dirty),
      rejected: c.rejected || undefined,
    }));
}

function sanitizeAlarmSound(raw: any): AlarmSound | null {
  if (!raw || typeof raw.uri !== 'string' || !raw.uri.startsWith('spotify:track:')) return null;
  const start = Number(raw.startMs);
  const end = Number(raw.endMs);
  const len = end - start;
  if (!(start >= 0) || !(len >= MIN_CLIP_MS && len <= MAX_CLIP_MS)) return null;
  return {
    uri: raw.uri,
    name: String(raw.name ?? ''),
    artist: String(raw.artist ?? ''),
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
    durationMs: Number(raw.durationMs) || end,
    startMs: start,
    endMs: end,
  };
}

// push result - clears dirty on rows the server took, unless edited during the push
function applyPush<T extends { id: string; updatedAt: number; dirty: boolean; rejected?: boolean }>(
  rows: T[], sent: T[], res: PushResult,
): T[] {
  const at = new Map(sent.map(r => [r.id, r.updatedAt]));
  const pushed = new Set(res.pushed);
  const rejected = new Set(res.rejected);
  return rows.map(r => {
    if (!r.dirty || at.get(r.id) !== r.updatedAt) return r;
    if (pushed.has(r.id)) return { ...r, dirty: false };
    if (rejected.has(r.id)) return { ...r, rejected: true };
    return r;
  });
}

const SYNC_ERROR = "Couldn't sync. Check your connection; changes are saved here and will retry.";

function explainBlocked(result: NudgeResult, what: 'nudge' | 'reminders' = 'nudge') {
  if (result !== 'denied' && result !== 'blocked') return;
  Alert.alert(
    'Notifications are off',
    what === 'nudge'
      ? 'Tomorrow needs permission to send the daily nudge. You can turn it on in Settings.'
      : 'Tomorrow needs permission to ring task reminders. You can turn it on in Settings.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ],
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [nudgeStatus, setNudgeStatus] = useState<NudgeResult | null>(null);
  const [forced, setForced] = useState(false);
  const [tick, setTick] = useState(0);
  const hydrated = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef<Promise<boolean> | null>(null);
  const { userId, ready: authReady } = useAuth();

  // load
  useEffect(() => {
    (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(KEY);
        // Older builds tracked pushes with a timestamp. Mark everything dirty
        // once so it is re-sent under the new scheme; upserts are idempotent.
        const legacy = (await AsyncStorage.getItem(LEGACY_PUSHED)) !== null;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<State>;
          setState({
            tasks: sanitizeTasks(parsed.tasks, legacy),
            customCats: sanitizeCustomCats(parsed.customCats),
            settings: {
              ...DEFAULT.settings,
              ...(parsed.settings ?? {}),
              alarmSound: sanitizeAlarmSound(parsed.settings?.alarmSound),
            },
            settingsDirty: parsed.settingsDirty ?? false,
          });
        }
        if (legacy) await AsyncStorage.removeItem(LEGACY_PUSHED);
      } catch (e) {
        warn('load failed', e);
        // Keep the unreadable copy so the next save can't destroy it.
        if (raw) await AsyncStorage.setItem(`${CORRUPT}.${Date.now()}`, raw).catch(() => {});
      } finally {
        hydrated.current = true;
        setReady(true);
      }
    })();
  }, []);

  // save
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(e => warn('save failed', e));
  }, [state]);

  // reschedule - never prompts; enableNudge() does the asking
  const nudgeColor = skinEye(state.settings.skin, state.customCats.filter(c => !c.deletedAt));
  // alarm sound - mirrored to the native side, which rings without JS running
  const sound = state.settings.alarmSound;
  const native = nativeAlarmsAvailable && sound !== null;
  useEffect(() => {
    if (!ready || !TomorrowAlarm) return;
    configureNativeSpotify();
    TomorrowAlarm.setAlarmSound(sound?.uri ?? null, sound?.startMs ?? 0, sound?.endMs ?? 0);
  }, [ready, sound?.uri, sound?.startMs, sound?.endMs]);

  useEffect(() => {
    if (!ready) return;
    const { hour, minute, notificationsOn } = state.settings;
    scheduleDailyNudge({ hour, minute, enabled: notificationsOn, color: nudgeColor, native }).then(setNudgeStatus);
  }, [ready, state.settings.hour, state.settings.minute, state.settings.notificationsOn, nudgeColor, native]);

  // reminders - rescheduled only when a reminder-relevant field changes;
  // calls are chained so an older set can never land after a newer one
  const index = useMemo(() => indexTasks(state.tasks), [state.tasks]);
  const today = todayKey();
  const reminders = useMemo<Reminder[]>(() => [
    ...state.tasks.filter(t => t.remindAt && !t.repeatDays && !t.deletedAt && !t.done),
    ...upcomingReminders(index, today, REMINDER_WINDOW),
  ].map(t => ({ id: t.id, text: t.text, at: atTime(t.day, t.remindAt!) })), [state.tasks, index, today]);
  const reminderSig = JSON.stringify(reminders);
  const reminderChain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!ready) return;
    reminderChain.current = reminderChain.current
      .then(() => scheduleTaskReminders(reminders, { color: nudgeColor, native }));
  }, [ready, reminderSig, nudgeColor, native]);

  // clock - recomputes day keys and the prompt check. Intervals stall in the
  // background, so also tick on resume and right after each local midnight.
  useEffect(() => {
    const bump = () => setTick(x => x + 1);
    const iv = setInterval(bump, 30_000);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') bump(); });
    let midnight: ReturnType<typeof setTimeout>;
    const arm = () => {
      midnight = setTimeout(() => { bump(); arm(); }, msUntilMidnight() + 1000);
    };
    arm();
    return () => {
      clearInterval(iv);
      clearTimeout(midnight);
      sub.remove();
    };
  }, []);

  const sync = async (): Promise<boolean> => {
    if (!userId) return false;
    setSyncing(true);
    try {
      // tasks: push
      const toPush = stateRef.current.tasks.filter(t => t.dirty && !t.rejected);
      if (toPush.length) {
        const res = await pushTasks(userId, toPush);
        if (!res) throw new Error('push failed');
        // Leave anything edited during the push dirty for the next round.
        setState(s => ({ ...s, tasks: applyPush(s.tasks, toPush, res) }));
        if (res.rejected.length) warn('rows rejected by server', res.rejected);
      }

      // settings: adopt the account's on first sync unless edited locally
      const first = !(await hasCursor());
      if (first && !stateRef.current.settingsDirty) {
        const remote = await pullSettings();
        if (remote) {
          setState(s => ({ ...s, settings: { ...s.settings, ...remote } }));
        } else {
          await pushSettings(userId, stateRef.current.settings);
        }
      } else if (stateRef.current.settingsDirty) {
        const sent = stateRef.current.settings;
        if (await pushSettings(userId, sent)) {
          setState(s => (s.settings === sent ? { ...s, settingsDirty: false } : s));
        }
      }

      // tasks: pull
      const remote = await pullTasks();
      if (!remote) throw new Error('pull failed');
      if (remote.length) {
        setState(s => ({ ...s, tasks: mergeTasks(s.tasks, remote) }));
      }

      // custom cats: push, then pull - after tasks so a cats failure never holds tasks back
      const catsToPush = stateRef.current.customCats.filter(c => c.dirty && !c.rejected);
      if (catsToPush.length) {
        const res = await pushCustomCats(userId, catsToPush);
        if (!res) throw new Error('cats push failed');
        setState(s => ({ ...s, customCats: applyPush(s.customCats, catsToPush, res) }));
        if (res.rejected.length) warn('cats rejected by server', res.rejected);
      }
      const remoteCats = await pullCustomCats();
      if (!remoteCats) throw new Error('cats pull failed');
      if (remoteCats.length) {
        setState(s => ({ ...s, customCats: mergeRows(s.customCats, remoteCats) }));
      }

      setLastSyncedAt(Date.now());
      setLastSyncError(null);
      return true;
    } catch (e) {
      warn('sync failed', e);
      setLastSyncError(SYNC_ERROR);
      return false;
    } finally {
      setSyncing(false);
    }
  };

  // run - one sync at a time; callers during a sync share its result
  const runSync = useRef<() => Promise<boolean>>(async () => false);
  runSync.current = () => {
    if (!inFlight.current) {
      inFlight.current = sync().finally(() => { inFlight.current = null; });
    }
    return inFlight.current;
  };

  // sync
  useEffect(() => {
    if (!ready || !authReady || !userId) return;
    runSync.current();
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') runSync.current();
    });
    const iv = setInterval(() => runSync.current(), 60_000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [ready, authReady, userId]);

  const value = useMemo<Store>(() => {
    const { tasks, settings, customCats } = state;
    const live = tasks.filter(t => !t.deletedAt);
    const liveCats = customCats
      .filter(c => !c.deletedAt)
      .sort((a, b) => a.createdAt - b.createdAt);

    const now = new Date();
    const pastNudgeTime =
      now.getHours() > settings.hour ||
      (now.getHours() === settings.hour && now.getMinutes() >= settings.minute);
    const shouldPrompt =
      forced || (ready && pastNudgeTime && settings.lastPromptedFor !== todayKey());

    const edit = (id: string, patch: (t: Task) => Partial<Task>) =>
      setState(s => {
        // an untouched day of a series becomes its own row here
        const t = resolve(s.tasks, id);
        return t ? { ...s, tasks: upsert(s.tasks, [touch(t, patch(t), Date.now())]) } : s;
      });

    // commit - applies changed rows; returns an undo
    const commit = (changed: Task[]) => {
      const before = stateRef.current.tasks;
      setState(s => ({ ...s, tasks: upsert(s.tasks, changed) }));
      return () => setState(s => ({ ...s, tasks: upsert(s.tasks, revert(before, changed, Date.now())) }));
    };

    // reminders are saved either way; they ring once permission is granted
    const askReminderPermission = () => {
      requestPermission().then(ok => {
        if (!ok) explainBlocked('blocked', 'reminders');
      });
    };

    const updateSettings = (patch: Partial<Settings>) =>
      setState(s => ({
        ...s,
        settings: { ...s.settings, ...patch },
        settingsDirty:
          s.settingsDirty ||
          SYNCED_SETTINGS.some(k => k in patch && patch[k] !== s.settings[k]),
      }));

    // nudge - `explain` is for the user turning it on themselves; other callers stay quiet
    const enableNudge = ({ explain = false } = {}) => {
      updateSettings({ notificationsOn: true });
      const eye = skinEye(settings.skin, liveCats);
      scheduleDailyNudge({
        hour: settings.hour, minute: settings.minute, enabled: true, color: eye, ask: true,
        native: nativeAlarmsAvailable && settings.alarmSound !== null,
      }).then(result => {
        setNudgeStatus(result);
        if (explain && (result === 'denied' || result === 'blocked')) {
          updateSettings({ notificationsOn: false });
          explainBlocked(result);
        }
      });
    };

    return {
      ready,
      syncing,
      lastSyncedAt,
      lastSyncError,
      unsyncedCount:
        tasks.filter(t => t.dirty && !t.rejected).length +
        customCats.filter(c => c.dirty && !c.rejected).length +
        (state.settingsDirty ? 1 : 0),
      nudgeStatus,
      tasks: live,
      customCats: liveCats,
      settings,
      shouldPrompt,
      today: todayKey(),
      tomorrow: tomorrowKey(),
      tasksFor: day =>
        tasksOn(index, day)
          .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt),
      getTask: id => {
        const t = resolve(tasks, id);
        return t && !t.deletedAt && !t.repeatDays ? t : null;
      },
      seriesFor: t => activeSeries(tasks, t),
      canExtend: series => !continuations(tasks, series).length,
      seriesRange: series => seriesRange(tasks, series),
      spanDays: (t, span) => spanDays(tasks, t, span),
      addTask: (text, day, { details = '', remindAt = null, repeat = null } = {}) => {
        const trimmed = text.trim().slice(0, MAX_TASK_LENGTH);
        if (!trimmed || (repeat && !repeatValid(repeat, day))) return null;
        const start = repeat ? firstMatch(repeat.days, day)! : day;
        const t: Task = {
          id: Crypto.randomUUID(),
          text: trimmed,
          details: details.trim().slice(0, MAX_DETAILS_LENGTH),
          day: start,
          done: false,
          remindAt: remindAt && REMIND_RE.test(remindAt) ? remindAt : null,
          repeatDays: repeat?.days ?? null,
          repeatUntil: repeat?.until ?? null,
          seriesId: null,
          occursOn: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          dirty: true,
        };
        if (t.remindAt) askReminderPermission();
        // First task is the moment to ask about the daily nudge.
        if (!tasks.length && settings.notificationsOn) enableNudge();
        setState(s => ({ ...s, tasks: [...s.tasks, t] }));
        return start;
      },
      updateTask: (id, raw, scope) => {
        const all = stateRef.current.tasks;
        const t = resolve(all, id);
        if (!t) return () => {};
        const e: TaskEdit = {
          ...raw,
          ...(raw.text !== undefined && { text: raw.text.trim().slice(0, MAX_TASK_LENGTH) || t.text }),
          ...(raw.details !== undefined && { details: raw.details.trim().slice(0, MAX_DETAILS_LENGTH) }),
        };
        const now = Date.now();
        const series = activeSeries(all, t);
        const untilOnly = series && e.repeat && Object.keys(e).length === 1 &&
          e.repeat.days.join() === series.repeatDays!.join();
        if (e.remindAt) askReminderPermission();

        if (!series) {
          return commit(e.repeat ? makeSeries(t, e, e.repeat, Crypto.randomUUID(), now) : editOne(t, e, now));
        }
        if (e.repeat === null) return commit(endFollowing(all, t, e, now));
        if (untilOnly) return commit(setUntil(all, series, e.repeat!.until, now));
        if (scope === 'following') return commit(editFollowing(all, t, e, Crypto.randomUUID(), now));
        return commit(editOne(t, e, now));
      },
      deleteTask: (id, what) => {
        const all = stateRef.current.tasks;
        const t = resolve(all, id);
        if (!t) return () => {};
        const now = Date.now();
        if (what === 'one' || !activeSeries(all, t)) return commit([touch(t, { deletedAt: now }, now)]);
        return commit(what === 'all'
          ? deleteAll(all, t, now)
          : deleteSpan(all, t, what, Crypto.randomUUID(), now));
      },
      toggleTask: id => edit(id, t => ({ done: !t.done })),
      removeTask: id => edit(id, () => ({ deletedAt: Date.now() })),
      restoreTask: id => edit(id, () => ({ deletedAt: null })),
      moveTask: (id, day) => {
        if (DAY_RE.test(day)) edit(id, () => ({ day }));
      },
      setReminder: (id, remindAt) => {
        if (remindAt !== null && !REMIND_RE.test(remindAt)) return;
        edit(id, () => ({ remindAt }));
        if (remindAt) askReminderPermission();
      },
      saveCustomCat: draft => {
        const now = Date.now();
        const id = draft.id ?? Crypto.randomUUID();
        const fields = {
          name: draft.name.trim().slice(0, MAX_CAT_NAME) || 'My cat',
          coat: draft.coat,
          eye: draft.eye,
          backdrop: draft.backdrop,
          pixels: draft.pixels,
          palette: draft.palette.slice(0, MAX_CAT_COLORS),
        };
        setState(s => {
          const exists = s.customCats.some(c => c.id === id);
          return {
            ...s,
            customCats: exists
              ? s.customCats.map(c =>
                  c.id === id
                    ? { ...c, ...fields, updatedAt: now, dirty: true, rejected: undefined }
                    : c)
              : [...s.customCats, {
                  id, ...fields, createdAt: now, updatedAt: now, deletedAt: null, dirty: true,
                }],
          };
        });
        return id;
      },
      deleteCustomCat: id => {
        const cat = customCats.find(c => c.id === id);
        if (!cat) return;
        // fall back to a preset: the old backdrop id if it was one, else the default
        if (settings.skin === customSkinId(id)) {
          updateSettings({ skin: SKINS.some(s => s.id === cat.backdrop) ? cat.backdrop : SKINS[0].id });
        }
        setState(s => ({
          ...s,
          customCats: s.customCats.map(c =>
            c.id === id
              ? { ...c, deletedAt: Date.now(), updatedAt: Date.now(), dirty: true, rejected: undefined }
              : c),
        }));
      },
      updateSettings,
      enableNudge,
      dismissPrompt: () => {
        setForced(false);
        updateSettings({ lastPromptedFor: todayKey() });
      },
      forcePrompt: () => setForced(true),
      syncNow: () => runSync.current(),
    };
  }, [state, ready, syncing, lastSyncedAt, lastSyncError, nudgeStatus, forced, tick]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
