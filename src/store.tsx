import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { todayKey, tomorrowKey } from './dates';
import { scheduleDailyNudge } from './notifications';
import { ensureSession } from './supabase';
import { pushTasks, pushSettings, pullTasks, mergeTasks } from './sync';

const KEY = 'tomorrow.state.v3';

// types
export type Task = {
  id: string;
  text: string;
  day: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type Settings = {
  skin: string;
  hour: number;
  minute: number;
  notificationsOn: boolean;
  lastPromptedFor: string | null;
};

type State = { tasks: Task[]; settings: Settings };

const DEFAULT: State = {
  tasks: [],
  settings: {
    skin: 'mono',
    hour: 20,
    minute: 30,
    notificationsOn: true,
    lastPromptedFor: null,
  },
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
  const [, setTick] = useState(0);
  const hydrated = useRef(false);
  const userId = useRef<string | null>(null);
  const dirty = useRef<Set<string>>(new Set());

  // load
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as State;
          setState({
            tasks: (parsed.tasks ?? []).map(t => ({
              ...t,
              updatedAt: t.updatedAt ?? t.createdAt,
              deletedAt: t.deletedAt ?? null,
            })),
            settings: { ...DEFAULT.settings, ...(parsed.settings ?? {}) },
          });
        }
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

  // reschedule
  useEffect(() => {
    if (!ready) return;
    const { hour, minute, notificationsOn } = state.settings;
    scheduleDailyNudge({ hour, minute, enabled: notificationsOn });
  }, [ready, state.settings.hour, state.settings.minute, state.settings.notificationsOn]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

const runSync = useRef(async () => {});
runSync.current = async () => {
  if (!userId.current) userId.current = await ensureSession();
  if (!userId.current) return;

  setSyncing(true);
  try {
    const raw = await AsyncStorage.getItem('tomorrow.pushedAt');
    const pushedAt = raw ? Number(raw) : 0;

    const toPush = state.tasks.filter(t => t.updatedAt > pushedAt);
    if (toPush.length) {
      const ok = await pushTasks(userId.current, toPush);
      if (ok) {
        const newest = Math.max(...toPush.map(t => t.updatedAt));
        await AsyncStorage.setItem('tomorrow.pushedAt', String(newest));
      }
    }

    await pushSettings(userId.current, state.settings);

    const remote = await pullTasks();
    if (remote && remote.length) {
      setState(s => ({ ...s, tasks: mergeTasks(s.tasks, remote) }));
    }
  } finally {
    setSyncing(false);
  }
};

  // sync
  useEffect(() => {
    if (!ready) return;
    runSync.current();
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') runSync.current();
    });
    const iv = setInterval(() => runSync.current(), 60_000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [ready]);

  // settings push
  useEffect(() => {
    if (!ready || !userId.current) return;
    pushSettings(userId.current, state.settings);
  }, [ready, state.settings.skin, state.settings.hour, state.settings.minute, state.settings.notificationsOn]);

  const value = useMemo<Store>(() => {
    const { tasks, settings } = state;
    const live = tasks.filter(t => !t.deletedAt);

    const now = new Date();
    const pastNudgeTime =
      now.getHours() > settings.hour ||
      (now.getHours() === settings.hour && now.getMinutes() >= settings.minute);
    const shouldPrompt =
      forced || (ready && pastNudgeTime && settings.lastPromptedFor !== todayKey());

    const mark = (id: string) => dirty.current.add(id);

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
        const trimmed = text.trim();
        if (!trimmed) return;
        const t: Task = {
          id: uid(),
          text: trimmed,
          day,
          done: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        };
        mark(t.id);
        setState(s => ({ ...s, tasks: [...s.tasks, t] }));
      },
      toggleTask: id => {
        mark(id);
        setState(s => ({
          ...s,
          tasks: s.tasks.map(t =>
            t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t,
          ),
        }));
      },
      removeTask: id => {
        mark(id);
        setState(s => ({
          ...s,
          tasks: s.tasks.map(t =>
            t.id === id ? { ...t, deletedAt: Date.now(), updatedAt: Date.now() } : t,
          ),
        }));
      },
      moveToTomorrow: id => {
        mark(id);
        setState(s => ({
          ...s,
          tasks: s.tasks.map(t =>
            t.id === id ? { ...t, day: tomorrowKey(), updatedAt: Date.now() } : t,
          ),
        }));
      },
      updateSettings: patch =>
        setState(s => ({ ...s, settings: { ...s.settings, ...patch } })),
      dismissPrompt: () => {
        setForced(false);
        setState(s => ({ ...s, settings: { ...s.settings, lastPromptedFor: todayKey() } }));
      },
      forcePrompt: () => setForced(true),
      syncNow: () => { runSync.current(); },
    };
  }, [state, ready, syncing, forced]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
