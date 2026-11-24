import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import TomorrowAlarm from '../modules/tomorrow-alarm';
import { warn } from './log';

// Registered in the Spotify developer dashboard, with the app's package name
// and signing SHA-1 for App Remote.
export const SPOTIFY_REDIRECT = 'tomorrow://spotify-auth';
const CLIENT_ID: string = Constants.expoConfig?.extra?.spotifyClientId ?? '';
const REFRESH_KEY = 'spotify.refresh';

export const MIN_CLIP_MS = 1_000;
export const MAX_CLIP_MS = 10_000;

export type Track = {
  uri: string;
  name: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number;
};

export type SpotifyStatus = 'ready' | 'unsupported' | 'unconfigured' | 'not-installed';

// availability - the alarm plays through the Spotify app via App Remote (Android only)
export function spotifyStatus(): SpotifyStatus {
  if (Platform.OS !== 'android' || !TomorrowAlarm) return 'unsupported';
  if (!CLIENT_ID) return 'unconfigured';
  if (!TomorrowAlarm.isSpotifyInstalled()) return 'not-installed';
  return 'ready';
}

// tells the native side how to reach Spotify when an alarm rings with the app closed
export function configureNativeSpotify() {
  if (CLIENT_ID) TomorrowAlarm?.configureSpotify(CLIENT_ID, SPOTIFY_REDIRECT);
}

// web api auth - PKCE, no client secret on the device

let access: { token: string; expires: number } | null = null;

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(body: Record<string, string>): Promise<boolean> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }).toString(),
  });
  if (!res.ok) {
    warn('spotify token failed', res.status);
    return false;
  }
  const json = await res.json();
  access = { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  if (json.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, json.refresh_token);
  return true;
}

export async function isSignedIn(): Promise<boolean> {
  return Boolean(access) || (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}

export async function signIn(): Promise<boolean> {
  const verifier = Array.from(Crypto.getRandomBytes(48), b => b.toString(16).padStart(2, '0')).join('');
  const challenge = b64url(await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 },
  ));
  const state = Crypto.randomUUID();
  const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT,
    // what App Remote needs; may spare a second consent screen when it connects
    scope: 'app-remote-control',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  }).toString();

  const result = await WebBrowser.openAuthSessionAsync(url, SPOTIFY_REDIRECT);
  if (result.type !== 'success') return false;
  const params = new URL(result.url).searchParams;
  if (params.get('state') !== state || !params.get('code')) return false;
  return tokenRequest({
    grant_type: 'authorization_code',
    code: params.get('code')!,
    redirect_uri: SPOTIFY_REDIRECT,
    code_verifier: verifier,
  });
}

export async function signOut() {
  access = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  TomorrowAlarm?.spotifyDisconnect();
}

async function token(): Promise<string | null> {
  if (access && access.expires > Date.now()) return access.token;
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return null;
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })) ? access!.token : null;
}

// search - dev-mode apps get at most 10 results per request
export async function searchTracks(q: string): Promise<Track[] | null> {
  const t = await token();
  if (!t) return null;
  const res = await fetch(
    'https://api.spotify.com/v1/search?' + new URLSearchParams({ q, type: 'track', limit: '10' }).toString(),
    { headers: { Authorization: `Bearer ${t}` } },
  );
  if (!res.ok) {
    warn('spotify search failed', res.status);
    if (res.status === 401) access = null;
    return null;
  }
  const json = await res.json();
  return (json.tracks?.items ?? []).map((i: any): Track => ({
    uri: i.uri,
    name: i.name,
    artist: (i.artists ?? []).map((a: any) => a.name).join(', '),
    imageUrl: i.album?.images?.[i.album.images.length - 1]?.url ?? null,
    durationMs: i.duration_ms,
  }));
}

// playback - through the Spotify app

export type PlayerResult =
  | { status: 'ok' | 'no-premium' }
  // code is one of SpotifyClient.kt's ERR_SPOTIFY_*; detail is Spotify's own message
  | { status: 'failed'; code?: string; detail?: string };

export async function connectPlayer(): Promise<PlayerResult> {
  if (!TomorrowAlarm) return { status: 'failed' };
  configureNativeSpotify();
  try {
    await TomorrowAlarm.spotifyConnect();
    return { status: (await TomorrowAlarm.spotifyCanPlayOnDemand()) ? 'ok' : 'no-premium' };
  } catch (e) {
    warn('spotify connect failed', e);
    const { code, message } = e as { code?: string; message?: string };
    return { status: 'failed', code, detail: message };
  }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;

export async function previewClip(uri: string, startMs: number, endMs: number): Promise<boolean> {
  if (!TomorrowAlarm) return false;
  stopPreview();
  try {
    await TomorrowAlarm.spotifyPlay(uri, startMs);
    previewTimer = setTimeout(stopPreview, endMs - startMs);
    return true;
  } catch (e) {
    warn('spotify preview failed', e);
    return false;
  }
}

export function stopPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
    TomorrowAlarm?.spotifyPause();
  }
}
