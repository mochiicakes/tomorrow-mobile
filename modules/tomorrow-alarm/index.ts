import { requireOptionalNativeModule } from 'expo';

// Android-only native side of the Spotify alarm. Null on iOS, web, Expo Go and
// dev clients built before this module existed - callers fall back to the purr.
type TomorrowAlarmNative = {
  isSpotifyInstalled(): boolean;
  configureSpotify(clientId: string, redirectUri: string): void;
  spotifyConnect(): Promise<void>;
  spotifyPlay(uri: string, fromMs: number): Promise<void>;
  spotifyPause(): void;
  spotifyCanPlayOnDemand(): Promise<boolean>;
  spotifyDisconnect(): void;

  setAlarmSound(uri: string | null, startMs: number, endMs: number): void;
  scheduleAlarm(id: string, atMs: number, title: string, body: string, url: string, weekly: boolean): void;
  cancelAlarm(id: string): void;
  cancelAlarmsWithPrefix(prefix: string): void;
  listAlarmIds(): string[];
  stopRinging(): void;
  canScheduleExactAlarms(): boolean;
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
  openExactAlarmSettings(): void;
  setShowWhenLocked(on: boolean): Promise<void>;
};

export default requireOptionalNativeModule<TomorrowAlarmNative>('TomorrowAlarm');
