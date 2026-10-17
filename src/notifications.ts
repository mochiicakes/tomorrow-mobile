import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { warn } from './log';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
export const notificationsAvailable = !(isExpoGo && Platform.OS === 'android');

const Notifications: typeof import('expo-notifications') | null =
  notificationsAvailable ? require('expo-notifications') : null;

export const NUDGE_ID = 'daily-tomorrow-nudge';

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
    name: 'Daily nudge',
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
}): Promise<NudgeResult> {
  if (!Notifications) return 'unavailable';
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
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