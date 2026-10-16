import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
export const notificationsAvailable = !(isExpoGo && Platform.OS === 'android');

const Notifications: typeof import('expo-notifications') | null =
  notificationsAvailable ? require('expo-notifications') : null;

export const NUDGE_ID = 'daily-tomorrow-nudge';

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
  await Notifications.setNotificationChannelAsync('tomorrow', {
    name: 'Tomorrow',
    importance: Notifications.AndroidImportance.HIGH,
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
      ...(Platform.OS === 'android' ? { channelId: 'tomorrow' } : {}),
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

// schedule - one weekly trigger per weekday so the copy rotates.
// Only asks for permission when `ask` is set; otherwise schedules if already granted.
export async function scheduleDailyNudge(opts: {
  hour: number;
  minute: number;
  enabled: boolean;
  color?: string;
  ask?: boolean;
}) {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!opts.enabled) return;

    const ok = opts.ask
      ? await requestPermission()
      : (await Notifications.getPermissionsAsync()).granted;
    if (!ok) return;
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
          ...(Platform.OS === 'android'
            ? { channelId: 'tomorrow', color: opts.color }
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
  } catch (e) {
    console.warn('[tomorrow] schedule failed', e);
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