import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Linking } from 'react-native';
import * as Crypto from 'expo-crypto';
import { todayKey, tomorrowKey } from './dates';
import { scheduleDailyNudge, type NudgeResult } from './notifications';
import { SKINS } from './theme';
import { useAuth } from './auth';
import { pushTasks, pushSettings, pullTasks, pullSettings, hasCursor, mergeTasks } from './sync';
import { warn } from './log';

const KEY = 'tomorrow.state.v3';
const CORRUPT = 'tomorrow.state.corrupt';
const LEGACY_PUSHED = 'tomorrow.pushedAt';
export const MAX_TASK_LENGTH = 500;

// types
export type Task = {
  id: string;
  text: string;
  day: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  // local only: changed since the last successful push
  dirty: boolean;
  // local only: the server refused this row for good; kept here, not retried
  rejected?: boolean;
};

export type Settings = {
  skin: string;
  hour: number;
  minute: number;
  notificationsOn: boolean;
  lastPromptedFor: string | null;
};

type State = { tasks: Task[]; settings: Settings; settingsDirty: boolean };

const SYNCED_SETTINGS: (keyof Settings)[] = ['skin', 'hour', 'minute', 'notificationsOn'];

const DEFAULT: State = {
  tasks: [],
  settings: {
    skin: 'mono',
    hour: 20,
    minute: 30,
    notificationsOn: true,
    lastPromptedFor: null,
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
  settings: Settings;
  tasksFor: (day: string) => Task[];
  addTask: (text: string, day: string) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  restoreTask: (id: string) => void;
  moveToTomorrow: (id: string) => void;
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
      createdAt: Number(t.createdAt) || Date.now(),
      updatedAt: Number(t.updatedAt ?? t.createdAt) || Date.now(),
      deletedAt: t.deletedAt ?? null,
      dirty: legacy || t.dirty === undefined ? true : Boolean(t.dirty),
      rejected: t.rejected || undefined,
    }));
}

const SYNC_ERROR = "Couldn't sync. Check your connection; changes are saved here and will retry.";

function explainBlocked(result: NudgeResult) {
  if (result !== 'denied' && result !== 'blocked') return;
  Alert.alert(
    'Notifications are off',
    'Tomorrow needs permission to send the daily nudge. You can turn it on in Settings.',
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
            settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) },
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
  useEffect(() => {
    if (!ready) return;
    const { hour, minute, notificationsOn, skin } = state.settings;
    const eye = SKINS.find(s => s.id === skin)?.eye;
    scheduleDailyNudge({ hour, minute, enabled: notificationsOn, color: eye }).then(setNudgeStatus);
  }, [ready, state.settings.hour, state.settings.minute, state.settings.notificationsOn, state.settings.skin]);

  // clock - recomputes day keys and the prompt check
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
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
        const sent = new Map(toPush.map(t => [t.id, t.updatedAt]));
        const pushed = new Set(res.pushed);
        const rejected = new Set(res.rejected);
        // Leave anything edited during the push dirty for the next round.
        setState(s => ({
          ...s,
          tasks: s.tasks.map(t => {
            if (!t.dirty || sent.get(t.id) !== t.updatedAt) return t;
            if (pushed.has(t.id)) return { ...t, dirty: false };
            if (rejected.has(t.id)) return { ...t, rejected: true };
            return t;
          }),
        }));
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
    const { tasks, settings } = state;
    const live = tasks.filter(t => !t.deletedAt);

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
      const eye = SKINS.find(s => s.id === settings.skin)?.eye;
      scheduleDailyNudge({
        hour: settings.hour, minute: settings.minute, enabled: true, color: eye, ask: true,
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
        tasks.filter(t => t.dirty && !t.rejected).length + (state.settingsDirty ? 1 : 0),
      nudgeStatus,
      tasks: live,
      settings,
      shouldPrompt,
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
      moveToTomorrow: id => edit(id, () => ({ day: tomorrowKey() })),
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
