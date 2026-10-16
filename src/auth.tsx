import React, {
  createContext, useContext, useEffect, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase, configured } from './supabase';

export type AuthState = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  signedIn: boolean;
  isGuest: boolean;
  configured: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  recovering: boolean;
  endRecovery: () => void;
  completeLink: (code: string, recovery: boolean) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  clearError: () => void;
};

const AuthContext = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(AuthContext);

const LAST_USER = 'tomorrow.lastUserId';
const CURSOR = 'tomorrow.sync.cursor';
const STATE = 'tomorrow.state.v3';
const PUSHED = 'tomorrow.pushedAt';
const CALLBACK = 'auth-callback';

// wipe
async function wipeLocalCache() {
  await AsyncStorage.multiRemove([STATE, CURSOR, PUSHED]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  // adopt
  const adopt = async (user: { id: string; email?: string | null } | null) => {
    if (!user) {
      setUserId(null);
      setEmail(null);
      return;
    }

    const prev = await AsyncStorage.getItem(LAST_USER);
    if (prev && prev !== user.id) {
      // Cache belongs to a different account. Keeping it would push one
      // account's tasks into another's rows.
      await wipeLocalCache();
    }
    await AsyncStorage.setItem(LAST_USER, user.id);

    setUserId(user.id);
    setEmail(user.email ?? null);
  };

  // boot
  useEffect(() => {
    if (!configured || !supabase) {
      setReady(true);
      return;
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) await adopt(data.session.user as any);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        setEmail(null);
        return;
      }
      if (session?.user) adopt(session.user as any);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (mail: string, password: string) => {
    if (!supabase) {
      setError('Not connected. Check your network.');
      return false;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { emailRedirectTo: Linking.createURL(CALLBACK) },
      });
      if (e) {
        setError(e.message);
        return false;
      }
      if (!data.session) {
        setNotice('Check your email and tap the link to finish creating your account.');
        return false;
      }
      await adopt(data.user as any);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (mail: string, password: string) => {
    if (!supabase) {
      setError('Not connected. Check your network.');
      return false;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: e } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      });
      if (e) {
        setError(e.message);
        return false;
      }
      await adopt(data.user as any);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      await supabase.auth.signOut();
      await wipeLocalCache();
      await AsyncStorage.removeItem(LAST_USER);
      setUserId(null);
      setEmail(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.rpc('delete_account');
      if (e) {
        setError(e.message);
        return false;
      }
      // The user no longer exists server-side, so only clear the local session.
      await supabase.auth.signOut({ scope: 'local' });
      await wipeLocalCache();
      await AsyncStorage.removeItem(LAST_USER);
      setUserId(null);
      setEmail(null);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async (mail: string) => {
    if (!supabase) {
      setError('Not connected. Check your network.');
      return false;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: Linking.createURL(CALLBACK, { queryParams: { type: 'recovery' } }),
      });
      if (e) {
        setError(e.message);
        return false;
      }
      setNotice('If that email has an account, a reset link is on its way.');
      return true;
    } finally {
      setBusy(false);
    }
  };

  // link - finishes email confirmation and password-reset links
  const completeLink = async (code: string, recovery: boolean) => {
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.auth.exchangeCodeForSession(code);
      if (e) {
        setError(e.message);
        return false;
      }
      await adopt(data.user as any);
      if (recovery) setRecovering(true);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) {
        setError(e.message);
        return false;
      }
      setRecovering(false);
      return true;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        userId,
        email,
        signedIn: Boolean(userId),
        isGuest: !userId,
        configured,
        busy,
        error,
        notice,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        sendPasswordReset,
        recovering,
        endRecovery: () => setRecovering(false),
        completeLink,
        updatePassword,
        clearError: () => {
          setError(null);
          setNotice(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
