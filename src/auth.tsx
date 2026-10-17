import React, {
  createContext, useContext, useEffect, useRef, useState,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase, configured } from './supabase';
import { showToast } from './toast';
import { warn } from './log';

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
  // set when sign-in failed because the email isn't confirmed yet
  unconfirmedEmail: string | null;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  resendConfirmation: () => Promise<void>;
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

export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// input
export const normalizeEmail = (mail: string) => mail.trim().toLowerCase();
export const isEmail = (mail: string) => EMAIL_RE.test(normalizeEmail(mail));

// errors - Supabase messages are for developers; map them to plain language
export function friendlyAuthError(e: unknown): string {
  const err = e as { code?: string; status?: number; message?: string; name?: string } | null;
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  warn('auth error', code || err?.name, err?.message);

  if (err?.name === 'AuthRetryableFetchError' || msg.includes('network request failed') || msg.includes('fetch')) {
    return 'No connection. Check your internet and try again.';
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Wrong email or password.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Confirm your email first. Check your inbox for the link.';
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (code === 'weak_password' || msg.includes('password should')) {
    return `Pick a stronger password (at least ${MIN_PASSWORD} characters).`;
  }
  if (code === 'same_password') {
    return 'That is your current password. Choose a new one.';
  }
  if (code.startsWith('over_') || err?.status === 429 || msg.includes('rate limit')) {
    return 'Too many tries. Wait a minute and try again.';
  }
  if (code === 'otp_expired' || code === 'flow_state_expired' || msg.includes('expired')) {
    return 'This link has expired or was already used.';
  }
  return 'Something went wrong. Please try again.';
}

// wipe
async function wipeLocalCache() {
  await AsyncStorage.multiRemove([STATE, CURSOR, PUSHED, LAST_USER]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const userRef = useRef<string | null>(null);
  // true while the user is signing out or deleting on purpose
  const leaving = useRef(false);

  const setUser = (id: string | null, mail: string | null) => {
    userRef.current = id;
    setUserId(id);
    setEmail(mail);
  };

  // adopt
  const adopt = async (user: { id: string; email?: string | null } | null) => {
    if (!user) {
      setUser(null, null);
      return;
    }

    const prev = await AsyncStorage.getItem(LAST_USER);
    if (prev && prev !== user.id) {
      // Cache belongs to a different account. Keeping it would push one
      // account's tasks into another's rows.
      await wipeLocalCache();
    }
    await AsyncStorage.setItem(LAST_USER, user.id);
    setUser(user.id, user.email ?? null);
  };

  // boot
  useEffect(() => {
    if (!configured || !supabase) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) await adopt(data.session.user as any);
      } catch (e) {
        warn('session restore failed', e);
      } finally {
        setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (leaving.current || !userRef.current) return;
        // Not requested by the user: refresh token expired or was revoked.
        // Clear the account's cache before the guest store mounts.
        wipeLocalCache()
          .catch(e => warn('wipe failed', e))
          .finally(() => {
            setUser(null, null);
            Alert.alert(
              'You were signed out',
              'Your session ended. Sign in again to keep syncing your tasks.',
            );
          });
        return;
      }
      if (session?.user) adopt(session.user as any).catch(e => warn('adopt failed', e));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // run - shared busy/error handling for every auth action
  const run = async <T,>(fallback: T, fn: () => Promise<T>): Promise<T> => {
    if (!supabase) {
      setError('Sync is unavailable right now.');
      return fallback;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      setError(friendlyAuthError(e));
      return fallback;
    } finally {
      setBusy(false);
    }
  };

  // leave - wipe first so the guest store that mounts next starts empty
  const leave = async (signOut: () => Promise<unknown>) => {
    leaving.current = true;
    try {
      await wipeLocalCache();
      await signOut();
      await wipeLocalCache();
      setUser(null, null);
    } finally {
      leaving.current = false;
    }
  };

  const signUp = (mail: string, password: string) => run(false, async () => {
    const address = normalizeEmail(mail);
    const { data, error: e } = await supabase!.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: Linking.createURL(CALLBACK) },
    });
    if (e) {
      setError(friendlyAuthError(e));
      return false;
    }
    // With email confirmation on, Supabase doesn't error for a taken email —
    // it returns a placeholder user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setError('That email already has an account. Try signing in instead.');
      return false;
    }
    if (!data.session) {
      setUnconfirmedEmail(address);
      setNotice('Check your email and tap the link to finish creating your account.');
      return false;
    }
    await adopt(data.user as any);
    showToast('Account created. Your tasks will sync.');
    return true;
  });

  const signIn = (mail: string, password: string) => run(false, async () => {
    const address = normalizeEmail(mail);
    const { data, error: e } = await supabase!.auth.signInWithPassword({
      email: address,
      password,
    });
    if (e) {
      setUnconfirmedEmail(e.code === 'email_not_confirmed' ? address : null);
      setError(friendlyAuthError(e));
      return false;
    }
    setUnconfirmedEmail(null);
    await adopt(data.user as any);
    showToast('Signed in. Syncing your tasks…');
    return true;
  });

  const resendConfirmation = () => run(undefined, async () => {
    if (!unconfirmedEmail) return;
    const { error: e } = await supabase!.auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: Linking.createURL(CALLBACK) },
    });
    if (e) {
      setError(friendlyAuthError(e));
      return;
    }
    setNotice('Sent another confirmation link. Check your inbox.');
  });

  const signOut = () => run(undefined, async () => {
    await leave(() => supabase!.auth.signOut());
    showToast('Signed out.');
  });

  // delete - re-checks the password so an unlocked phone alone can't wipe the account
  const deleteAccount = (password: string) => run(false, async () => {
    if (!email) return false;
    const { error: authErr } = await supabase!.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(authErr.code === 'invalid_credentials'
        ? 'That password is not right.'
        : friendlyAuthError(authErr));
      return false;
    }
    const { error: e } = await supabase!.rpc('delete_account');
    if (e) {
      warn('delete_account failed', e.message);
      setError('Could not delete your account. Please try again.');
      return false;
    }
    // The user no longer exists server-side, so only clear the local session.
    await leave(() => supabase!.auth.signOut({ scope: 'local' }));
    showToast('Your account and synced tasks were deleted.');
    return true;
  });

  const sendPasswordReset = (mail: string) => run(false, async () => {
    const { error: e } = await supabase!.auth.resetPasswordForEmail(normalizeEmail(mail), {
      redirectTo: Linking.createURL(CALLBACK, { queryParams: { type: 'recovery' } }),
    });
    if (e) {
      setError(friendlyAuthError(e));
      return false;
    }
    setNotice('If that email has an account, a reset link is on its way.');
    return true;
  });

  // link - finishes email confirmation and password-reset links
  const completeLink = (code: string, recovery: boolean) => run(false, async () => {
    const { data, error: e } = await supabase!.auth.exchangeCodeForSession(code);
    if (e) {
      setError(friendlyAuthError(e));
      return false;
    }
    await adopt(data.user as any);
    setUnconfirmedEmail(null);
    if (recovery) setRecovering(true);
    else showToast('Email confirmed. You are signed in.');
    return true;
  });

  const updatePassword = (password: string) => run(false, async () => {
    const { error: e } = await supabase!.auth.updateUser({ password });
    if (e) {
      setError(friendlyAuthError(e));
      return false;
    }
    setRecovering(false);
    showToast('Password updated.');
    return true;
  });

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
        unconfirmedEmail,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        sendPasswordReset,
        resendConfirmation,
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
