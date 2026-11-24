import React, { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Image, AppState, Keyboard, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Title, Muted, Card, Field, AccentButton, GhostButton } from '../src/ui';
import { Text } from '../src/Txt';
import { useTheme, space } from '../src/theme';
import { useStore, type AlarmSound } from '../src/store';
import { DANGER } from '../src/toast';
import { ClipPicker, fmtMs } from '../src/ClipPicker';
import {
  spotifyStatus, isSignedIn, signIn, signOut, connectPlayer, searchTracks,
  previewClip, stopPreview, type Track, type PlayerResult,
} from '../src/spotify';
import TomorrowAlarm from '../modules/tomorrow-alarm';

const DEFAULT_CLIP_MS = 5_000;

// sensible first clip: 30s in (past most intros), 5s long
function firstClip(t: Track): Pick<AlarmSound, 'startMs' | 'endMs'> {
  const start = Math.max(0, Math.min(30_000, t.durationMs - DEFAULT_CLIP_MS));
  return { startMs: start, endMs: Math.min(start + DEFAULT_CLIP_MS, t.durationMs) };
}

const CONNECT_ERRORS: Record<string, string> = {
  ERR_SPOTIFY_NOT_AUTHORIZED: "Spotify hasn't given Tomorrow access. Open Spotify, then connect again and tap Agree.",
  ERR_SPOTIFY_LOGGED_OUT: 'Log in to the Spotify app, then try again.',
  ERR_SPOTIFY_OFFLINE: 'Turn off offline mode in Spotify, then try again.',
  ERR_SPOTIFY_OUTDATED: 'Update the Spotify app, then try again.',
  ERR_SPOTIFY_TIMEOUT: "Spotify didn't respond. Open it once, then try again.",
};

// failures the user can't fix from our wording alone keep Spotify's own message
function connectError({ code, detail }: Extract<PlayerResult, { status: 'failed' }>): string {
  if (code && CONNECT_ERRORS[code]) return CONNECT_ERRORS[code];
  const text = code === 'ERR_SPOTIFY_APP_NOT_REGISTERED'
    ? "Spotify doesn't recognise this build of Tomorrow."
    : "Couldn't reach the Spotify app. Open it once, then try again.";
  return detail ? `${text} (${detail})` : text;
}

function Back() {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{
        width: 34, height: 30,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: t.hairline,
      }}
    >
      <Text style={{ color: t.text, fontSize: 14 }}>{'<'}</Text>
    </Pressable>
  );
}

// permissions Android needs for the alarm to ring on time and over the lock screen
function useAlarmAccess() {
  const read = () => ({
    exact: TomorrowAlarm?.canScheduleExactAlarms() ?? true,
    fullScreen: TomorrowAlarm?.canUseFullScreenIntent() ?? true,
  });
  const [access, setAccess] = useState(read);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setAccess(read()); });
    return () => sub.remove();
  }, []);
  return access;
}

export default function AlarmSoundScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useStore();
  const status = spotifyStatus();
  const access = useAlarmAccess();

  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [draft, setDraft] = useState<AlarmSound | null>(settings.alarmSound);
  const [playing, setPlaying] = useState(false);

  // reconnect quietly when already signed in
  useEffect(() => {
    if (status !== 'ready') return;
    isSignedIn().then(ok => { if (ok) connect(false); });
    return stopPreview;
  }, []);

  const connect = async (interactive: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (interactive && !(await isSignedIn()) && !(await signIn())) {
        setError("Couldn't sign in to Spotify.");
        return;
      }
      const player = await connectPlayer();
      if (player.status === 'no-premium') setError('Spotify Premium is needed to play a chosen song.');
      else if (player.status === 'failed') setError(connectError(player));
      setConnected(player.status === 'ok');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    const found = await searchTracks(q);
    setBusy(false);
    if (!found) setError("Search didn't work. Check your connection and try again.");
    else setResults(found);
  };

  const pick = (track: Track) => {
    stopPreview();
    setPlaying(false);
    setDraft({ ...track, ...firstClip(track) });
    setResults([]);
  };

  const preview = async () => {
    if (!draft) return;
    if (playing) {
      stopPreview();
      setPlaying(false);
      return;
    }
    const ok = await previewClip(draft.uri, draft.startMs, draft.endMs);
    if (!ok) return setError("Couldn't play the preview in Spotify.");
    setPlaying(true);
    setTimeout(() => setPlaying(false), draft.endMs - draft.startMs);
  };

  const save = () => {
    if (!draft) return;
    stopPreview();
    updateSettings({ alarmSound: draft });
    router.back();
  };

  const usePurr = () => {
    stopPreview();
    updateSettings({ alarmSound: null });
    router.back();
  };

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + space(1),
          paddingHorizontal: space(2),
          paddingBottom: insets.bottom + space(6),
          gap: space(2),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
          <Back />
          <Title>Alarm sound</Title>
        </View>
        <Muted>
          Pick a song and the part you want. It rings for the daily nudge and task reminders.
        </Muted>

        {status !== 'ready' && (
          <Card style={{ gap: space(1) }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>Spotify isn't available</Text>
            <Muted>
              {status === 'not-installed'
                ? 'Install the Spotify app and sign in to use a song as your alarm.'
                : status === 'unconfigured'
                  ? 'This build has no Spotify client ID set.'
                  : Platform.OS === 'web'
                    ? 'Song alarms ring through the Spotify app on Android. Set one from the Tomorrow app on your phone.'
                    : 'Song alarms need the Android build of Tomorrow.'}
            </Muted>
          </Card>
        )}

        {/* android access */}
        {status === 'ready' && !access.exact && (
          <Pressable onPress={() => TomorrowAlarm?.openExactAlarmSettings()}>
            <Text style={{ color: DANGER, fontSize: 12 }}>
              Alarms may ring late. Tap to allow Tomorrow to set exact alarms.
            </Text>
          </Pressable>
        )}
        {status === 'ready' && !access.fullScreen && (
          <Pressable onPress={() => TomorrowAlarm?.openFullScreenIntentSettings()}>
            <Text style={{ color: DANGER, fontSize: 12 }}>
              The alarm can't open over the lock screen. Tap to allow full-screen alerts.
            </Text>
          </Pressable>
        )}

        {error && <Text style={{ color: DANGER, fontSize: 12 }}>{error}</Text>}

        {status === 'ready' && !connected && (
          <AccentButton label={busy ? 'Connecting…' : 'Connect Spotify'} onPress={() => connect(true)} disabled={busy} />
        )}

        {/* search */}
        {status === 'ready' && connected && (
          <Card style={{ gap: space(1.5) }}>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search for a song…"
              returnKeyType="search"
              onSubmitEditing={search}
              autoCorrect={false}
            />
            {busy && <Muted>Searching…</Muted>}
            {results.map(r => (
              <Pressable
                key={r.uri}
                onPress={() => pick(r)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: space(1.5),
                  padding: 6, backgroundColor: pressed ? t.raised : 'transparent',
                })}
              >
                {r.imageUrl
                  ? <Image source={{ uri: r.imageUrl }} style={{ width: 40, height: 40 }} />
                  : <View style={{ width: 40, height: 40, backgroundColor: t.raised }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>{r.name}</Text>
                  <Muted style={{ fontSize: 12 }}>{r.artist} · {fmtMs(r.durationMs).replace(/\.\d$/, '')}</Muted>
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        {/* clip */}
        {draft && (
          <Card style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
              {draft.imageUrl && <Image source={{ uri: draft.imageUrl }} style={{ width: 48, height: 48 }} />}
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{draft.name}</Text>
                <Muted style={{ fontSize: 12 }}>{draft.artist}</Muted>
              </View>
            </View>
            <ClipPicker
              durationMs={draft.durationMs}
              startMs={draft.startMs}
              endMs={draft.endMs}
              onChange={(startMs, endMs) => setDraft(d => (d ? { ...d, startMs, endMs } : d))}
            />
            {connected && (
              <GhostButton label={playing ? 'Stop' : 'Preview clip'} onPress={preview} />
            )}
          </Card>
        )}

        {draft && status === 'ready' && <AccentButton label="Use this clip" onPress={save} />}
        {settings.alarmSound && <GhostButton label="Use the purr instead" onPress={usePurr} />}
        {status === 'ready' && connected && (
          <Pressable
            onPress={() => { signOut(); setConnected(false); setResults([]); }}
            style={{ alignItems: 'center', paddingVertical: space(1) }}
          >
            <Muted style={{ fontSize: 12 }}>Disconnect Spotify</Muted>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}
