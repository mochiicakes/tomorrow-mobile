import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn } from './log';

// release - change the id and notes when an update has something to tell.
// Everyone who opens the app after that sees the notes once.
export const RELEASE = {
  id: '2026-11-tasks',
  notes: [
    'Tasks can now have notes.',
    'Repeat a task on the days you choose.',
    'Change or delete one day of a repeat, or many at once.',
    'Adding and editing tasks now open a bigger window.',
    'Song alarms connect to Spotify more reliably.',
    'Your cat now keeps you company on the Today tab.',
  ],
};

export type Intro = 'welcome' | 'whatsNew' | null;

// device-wide, so signing out (which wipes the task cache) never shows the welcome again
const KEY = 'tomorrow.intro';
type Seen = { welcomed: boolean; seenRelease: string | null };

// what to show on launch. `hadData` means this device already used an older build.
export async function pendingIntro(hadData: boolean): Promise<Intro> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const seen: Seen | null = raw ? JSON.parse(raw) : null;
    if (!seen) return hadData ? 'whatsNew' : 'welcome';
    if (!seen.welcomed) return 'welcome';
    return seen.seenRelease === RELEASE.id ? null : 'whatsNew';
  } catch (e) {
    warn('intro read failed', e);
    return null;
  }
}

// both windows count as seeing this release; new users don't need its notes
export function markIntroSeen() {
  const seen: Seen = { welcomed: true, seenRelease: RELEASE.id };
  AsyncStorage.setItem(KEY, JSON.stringify(seen)).catch(e => warn('intro save failed', e));
}
