import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { notificationsAvailable, debugListScheduled } from './notifications';

export type Diagnostics = {
  platform: string;
  executionEnvironment: string;
  notificationsAvailable: boolean;
  permission: string;
  scheduledCount: number;
  nextTrigger: string | null;
};

export async function collectDiagnostics(): Promise<Diagnostics> {
  const base = {
    platform: Platform.OS,
    executionEnvironment: String(Constants.executionEnvironment),
    notificationsAvailable,
    permission: 'unknown',
    scheduledCount: 0,
    nextTrigger: null as string | null,
  };

  if (!notificationsAvailable) return base;

  try {
    const Notifications = require('expo-notifications');
    const perms = await Notifications.getPermissionsAsync();
    base.permission = perms.granted ? 'granted' : perms.canAskAgain ? 'denied' : 'blocked';

    const scheduled = await debugListScheduled();
    base.scheduledCount = scheduled.length;

    const t = scheduled[0]?.trigger;
    if (t) base.nextTrigger = JSON.stringify(t);
  } catch (e) {
    base.permission = `error: ${String(e)}`;
  }

  return base;
}