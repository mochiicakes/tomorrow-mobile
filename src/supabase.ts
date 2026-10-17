import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { secureSessionStorage } from './secureSession';
import { warn } from './log';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

if (!configured) {
  warn('supabase env missing', { url: !!url, key: !!key });
}

// client - native keeps the session encrypted; web has no keystore
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        storage: Platform.OS === 'web' ? AsyncStorage : secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    })
  : null;

// refresh
AppState.addEventListener('change', state => {
  if (!supabase) return;
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
