import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { todayKey, tomorrowKey } from './dates';
import { scheduleDailyNudge } from './notifications';
import { SKINS } from './theme';
import { useAuth } from './auth';
import { pushTasks, pushSettings, pullTasks, pullSettings, hasCursor, mergeTasks } from './sync';

const KEY = 'tomorrow.state.v3';
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
  tasks: Task[];
  settings: Settings;
  tasksFor: (day: string) => Task[];
  addTask: (text: string, day: string) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  moveToTomorrow: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  enableNudge: () => void;
  shouldPrompt: boolean;
  dismissPrompt: () => void;
  forcePrompt: () => void;
  syncNow: () => void;
};

const StoreContext = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(StoreContext);

const uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [forced, setForced] = useState(false);
  const [tick, setTick] = useState(0);
  const hydrated = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);
  const { userId, ready: authReady } = useAuth();

  // load
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        // Older builds tracked pushes with a timestamp. Mark everything dirty
        // once so it is re-sent under the new scheme; upserts are idempotent.
        const legacy = (await AsyncStorage.getItem(LEGACY_PUSHED)) !== null;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<State>;
          setState({
            tasks: (parsed.tasks ?? []).map(t => ({
              ...t,
              updatedAt: t.updatedAt ?? t.createdAt,
              deletedAt: t.deletedAt ?? null,
              dirty: legacy || t.dirty === undefined ? true : t.dirty,
            })),
            settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) },
            settingsDirty: parsed.settingsDirty ?? false,
          });
        }
        if (legacy) await AsyncStorage.removeItem(LEGACY_PUSHED);
      } catch (e) {
        console.warn('[tomorrow] load failed', e);
      } finally {
        hydrated.current = true;
        setReady(true);
      }
    })();
  }, []);

  // save
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(e =>
      console.warn('[tomorrow] save failed', e),
    );
  }, [state]);

  // reschedule - never prompts; enableNudge() does the asking
  useEffect(() => {
    if (!ready) return;
    const { hour, minute, notificationsOn, skin } = state.settings;
    const eye = SKINS.find(s => s.id === skin)?.eye;
    scheduleDailyNudge({ hour, minute, enabled: notificationsOn, color: eye });
  }, [ready, state.settings.hour, state.settings.minute, state.settings.notificationsOn, state.settings.skin]);

  // clock - recomputes day keys and the prompt check
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const runSync = useRef(async () => {});
  runSync.current = async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      // tasks: push
      const toPush = stateRef.current.tasks.filter(t => t.dirty);
      if (toPush.length && (await pushTasks(userId, toPush))) {
        const sent = new Map(toPush.map(t => [t.id, t.updatedAt]));
        // Leave anything edited during the push dirty for the next round.
        setState(s => ({
          ...s,
          tasks: s.tasks.map(t =>
            t.dirty && sent.get(t.id) === t.updatedAt ? { ...t, dirty: false } : t,
          ),
        }));
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
      if (remote && remote.length) {
        setState(s => ({ ...s, tasks: mergeTasks(s.tasks, remote) }));
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
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
          t.id === id ? { ...t, ...patch(t), updatedAt: Date.now(), dirty: true } : t,
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

    const enableNudge = () => {
      updateSettings({ notificationsOn: true });
      const eye = SKINS.find(s => s.id === settings.skin)?.eye;
      scheduleDailyNudge({
        hour: settings.hour, minute: settings.minute, enabled: true, color: eye, ask: true,
      });
    };

    return {
      ready,
      syncing,
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
          id: uid(),
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
      moveToTomorrow: id => edit(id, () => ({ day: tomorrowKey() })),
      updateSettings,
      enableNudge,
      dismissPrompt: () => {
        setForced(false);
        updateSettings({ lastPromptedFor: todayKey() });
      },
      forcePrompt: () => setForced(true),
      syncNow: () => { runSync.current(); },
    };
  }, [state, ready, syncing, forced, tick]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
