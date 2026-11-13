import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Linking } from 'react-native';
import * as Crypto from 'expo-crypto';
import { todayKey, tomorrowKey, msUntilMidnight, atTime } from './dates';
import {
  scheduleDailyNudge, scheduleTaskReminders, requestPermission, nativeAlarmsAvailable,
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
export const MAX_CAT_NAME = 24;
export const MAX_CAT_COLORS = 10;

// types
export type Task = {
  id: string;
  text: string;
  day: string;
  done: boolean;
  // 'HH:MM' local time on `day`, or null for no reminder
  remindAt: string | null;
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
  saveCustomCat: (draft: CustomCatDraft) => string;
  deleteCustomCat: (id: string) => void;
  addTask: (text: string, day: string) => void;
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
      day: t.day!,
      done: Boolean(t.done),
      remindAt: typeof t.remindAt === 'string' && REMIND_RE.test(t.remindAt) ? t.remindAt : null,
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
      { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
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
  const reminders: Reminder[] = state.tasks
    .filter(t => t.remindAt && !t.deletedAt && !t.done)
    .map(t => ({ id: t.id, text: t.text, at: atTime(t.day, t.remindAt!) }));
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
      setState(s => ({
        ...s,
        tasks: s.tasks.map(t =>
          t.id === id
            ? { ...t, ...patch(t), updatedAt: Date.now(), dirty: true, rejected: undefined }
            : t,
        ),
      }));

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
        live
          .filter(t => t.day === day)
          .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt),
      addTask: (text, day) => {
        const trimmed = text.trim().slice(0, MAX_TASK_LENGTH);
        if (!trimmed) return;
        const t: Task = {
          id: Crypto.randomUUID(),
          text: trimmed,
          day,
          done: false,
          remindAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          dirty: true,
        };
        // First task is the moment to ask about the daily nudge.
        if (!tasks.length && settings.notificationsOn) enableNudge();
        setState(s => ({ ...s, tasks: [...s.tasks, t] }));
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
        // the reminder is saved either way; it rings once permission is granted
        if (remindAt) {
          requestPermission().then(ok => {
            if (!ok) explainBlocked('blocked', 'reminders');
          });
        }
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
