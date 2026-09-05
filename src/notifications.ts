import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
export const notificationsAvailable = !(isExpoGo && Platform.OS === 'android');

const Notifications: typeof import('expo-notifications') | null =
  notificationsAvailable ? require('expo-notifications') : null;

export const NUDGE_ID = 'daily-tomorrow-nudge';
// handler
export function installNotificationHandler() {
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
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('tomorrow', {
    name: 'Tomorrow',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// permission
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

const COPY = [
  { title: 'Meow!.', body: 'Set up tomorrow before you forget it.' },
  { title: 'Prr...', body: "What are you up to?" },
  { title: 'Hooman...', body: 'Any plans for tomorrow?' },
];

// schedule
export async function scheduleDailyNudge(opts: {
  hour: number;
  minute: number;
  enabled: boolean;
}) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!opts.enabled) return;

    const ok = await requestPermission();
    if (!ok) return;
    await ensureAndroidChannel();

    const copy = COPY[Math.floor(Math.random() * COPY.length)];

    await Notifications.scheduleNotificationAsync({
      identifier: NUDGE_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: { openPrompt: true },
        ...(Platform.OS === 'android' ? { channelId: 'tomorrow' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: opts.hour,
        minute: opts.minute,
      },
    });
  } catch (e) {
    console.warn('[tomorrow] schedule failed', e);
  }
}

// debug
export async function debugListScheduled() {
  return Notifications.getAllScheduledNotificationsAsync();
}
