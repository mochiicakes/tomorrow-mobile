import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { warn } from './log';
import TomorrowAlarm from '../modules/tomorrow-alarm';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
export const notificationsAvailable = !(isExpoGo && Platform.OS === 'android');

const Notifications: typeof import('expo-notifications') | null =
  notificationsAvailable ? require('expo-notifications') : null;

export const NUDGE_ID = 'daily-tomorrow-nudge';
const NUDGE_IDS = [1, 2, 3, 4, 5, 6, 7].map(w => `${NUDGE_ID}-${w}`);
export const REMINDER_PREFIX = 'task-';

// native alarms (Android + Spotify sound) - ring through the app's own service
export const nativeAlarmsAvailable = Platform.OS === 'android' && TomorrowAlarm !== null;
const NATIVE_NUDGE_PREFIX = 'nudge-';

const alarmUrl = (params: Record<string, string>) =>
  `tomorrow://alarm?${new URLSearchParams(params).toString()}`;

// next local occurrence of weekday (1 = Sunday … 7 = Saturday) at hour:minute
function nextWeekday(weekday: number, hour: number, minute: number): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  while (d.getDay() + 1 !== weekday || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// iOS keeps at most 64 pending; leave room for the 7 nudges
const MAX_REMINDERS = 50;

// Android locks a channel's sound once created, so a sound change needs a new id.
const CHANNEL_ID = 'tomorrow-purr';
const OLD_CHANNEL_IDS = ['tomorrow', 'tomorrow-nudges', 'tomorrow-daily'];

// bundled via the expo-notifications `sounds` plugin option in app.json
const SOUND = 'purr.wav';

// handler
export function installNotificationHandler() {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// channel
export async function ensureAndroidChannel() {
  if (!Notifications) return;
  if (Platform.OS !== 'android') return;
  for (const id of OLD_CHANNEL_IDS) {
    await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
  }
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Nudges and reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: SOUND,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// test
export async function sendTestNotification(seconds = 10): Promise<boolean> {
  if (!Notifications) return false;
  const ok = await requestPermission();
  if (!ok) return false;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test',
      body: 'If you see this, delivery works.',
      sound: SOUND,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
  return true;
}

// settings - the app's system settings page; web has none
export function openAppSettings() {
  if (Platform.OS === 'web') return;
  Linking.openSettings().catch(() => {});
}

// permission
export async function requestPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

const COPY = [
  { title: 'Meow!', body: 'Set up tomorrow before you forget it.' },
  { title: 'Prr...', body: 'What are you up to?' },
  { title: 'Hooman...', body: 'Any plans for tomorrow?' },
];

// 'denied' can still be asked again; 'blocked' needs the system settings
export type NudgeResult = 'scheduled' | 'off' | 'denied' | 'blocked' | 'unavailable' | 'failed';

// schedule - one weekly trigger per weekday so the copy rotates.
// Only asks for permission when `ask` is set; otherwise schedules if already granted.
export async function scheduleDailyNudge(opts: {
  hour: number;
  minute: number;
  enabled: boolean;
  color?: string;
  ask?: boolean;
  // ring through the native alarm (Spotify clip) instead of a notification
  native?: boolean;
}): Promise<NudgeResult> {
  if (!Notifications) return 'unavailable';
  try {
    // only the nudge's own ids - task reminders live alongside it
    await Promise.all(NUDGE_IDS.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    TomorrowAlarm?.cancelAlarmsWithPrefix(NATIVE_NUDGE_PREFIX);
    if (!opts.enabled) return 'off';

    const ok = opts.ask
      ? await requestPermission()
      : (await Notifications.getPermissionsAsync()).granted;
    if (!ok) {
      const { canAskAgain } = await Notifications.getPermissionsAsync();
      return canAskAgain ? 'denied' : 'blocked';
    }
    await ensureAndroidChannel();

    // weekday: 1 = Sunday … 7 = Saturday
    for (let weekday = 1; weekday <= 7; weekday++) {
      const copy = COPY[weekday % COPY.length];
      if (opts.native && TomorrowAlarm) {
        TomorrowAlarm.scheduleAlarm(
          `${NATIVE_NUDGE_PREFIX}${weekday}`,
          nextWeekday(weekday, opts.hour, opts.minute),
          copy.title, copy.body,
          alarmUrl({ kind: 'nudge', title: copy.title, body: copy.body }),
          true,
        );
        continue;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: `${NUDGE_ID}-${weekday}`,
        content: {
          title: copy.title,
          body: copy.body,
          data: { openPrompt: true },
          sound: SOUND,
          ...(Platform.OS === 'android'
            ? { channelId: CHANNEL_ID, color: opts.color }
            : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: opts.hour,
          minute: opts.minute,
        },
      });
    }
    return 'scheduled';
  } catch (e) {
    warn('schedule failed', e);
    return 'failed';
  }
}

// reminders - replaces every scheduled task reminder with the given set.
// Never prompts; the task sheet asks when a reminder is turned on.
export type Reminder = { id: string; text: string; at: number };

export async function scheduleTaskReminders(
  reminders: Reminder[], opts: { color?: string; native?: boolean } = {},
): Promise<void> {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled
      .filter(n => n.identifier.startsWith(REMINDER_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
    TomorrowAlarm?.cancelAlarmsWithPrefix(REMINDER_PREFIX);

    const now = Date.now();
    const upcoming = reminders
      .filter(r => r.at > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_REMINDERS);
    if (!upcoming.length) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await ensureAndroidChannel();

    for (const r of upcoming) {
      if (opts.native && TomorrowAlarm) {
        TomorrowAlarm.scheduleAlarm(
          `${REMINDER_PREFIX}${r.id}`, r.at, 'Reminder', r.text,
          alarmUrl({ kind: 'task', id: r.id, title: 'Reminder', body: r.text }),
          false,
        );
        continue;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_PREFIX}${r.id}`,
        content: {
          title: 'Reminder',
          body: r.text,
          data: { taskId: r.id },
          sound: SOUND,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID, color: opts.color } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
    }
  } catch (e) {
    warn('reminders failed', e);
  }
}

// tap - fires for taps while running and for the tap that launched the app
export function onNudgeTapped(cb: () => void): () => void {
  if (!Notifications) return () => {};
  const isNudge = (r: { notification: { request: { content: { data?: any } } } } | null) =>
    Boolean(r?.notification.request.content.data?.openPrompt);

  Notifications.getLastNotificationResponseAsync()
    .then(r => {
      if (isNudge(r)) {
        cb();
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    })
    .catch(() => {});

  const sub = Notifications.addNotificationResponseReceivedListener(r => {
    if (isNudge(r)) cb();
  });
  return () => sub.remove();
}

// debug
export async function debugListScheduled() {
  if (!Notifications) return [];
  return Notifications.getAllScheduledNotificationsAsync();
}