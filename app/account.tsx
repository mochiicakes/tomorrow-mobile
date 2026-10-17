import React, { useState } from 'react';
import {
  View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Screen, Title, Muted, Card, Field, AccentButton, GhostButton } from '../src/ui';
import { Text } from '../src/Txt';
import { Cat } from '../src/Cat';
import { useAuth, isEmail, MIN_PASSWORD } from '../src/auth';
import { useStore } from '../src/store';
import { useTheme, space } from '../src/theme';
import { showToast, DANGER } from '../src/toast';

// "just now", "5 min ago", "3 h ago"
function ago(ts: number) {
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

export default function AccountScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const {
    userId, email, isGuest, configured, busy, error, notice, unconfirmedEmail,
    signUp, signIn, signOut, deleteAccount, sendPasswordReset, resendConfirmation, clearError,
  } = useAuth();
  const { tasks, syncing, syncNow, lastSyncedAt, lastSyncError, unsyncedCount } = useStore();

  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePass, setDeletePass] = useState('');

  const submit = async () => {
    if (busy) return;
    setNote(null);
    if (!isEmail(mail)) {
      setNote('That does not look like an email address.');
      return;
    }
    if (mode === 'up') {
      if (pass.length < MIN_PASSWORD) {
        setNote(`Password needs at least ${MIN_PASSWORD} characters.`);
        return;
      }
      if (pass !== confirm) {
        setNote('The two passwords do not match.');
        return;
      }
    } else if (!pass) {
      setNote('Type your password.');
      return;
    }
    const ok = mode === 'up' ? await signUp(mail, pass) : await signIn(mail, pass);
    if (ok) {
      setMail('');
      setPass('');
      setConfirm('');
      setNote(null);
    }
  };

  const forgot = async () => {
    if (busy) return;
    setNote(null);
    if (!isEmail(mail)) {
      setNote('Type your email above first.');
      return;
    }
    await sendPasswordReset(mail);
  };

  const manualSync = async () => {
    if (await syncNow()) showToast('All synced.');
    else showToast({ message: "Couldn't sync. Check your connection.", tone: 'error' });
  };

  // sign out - signing out wipes this device, so unsynced work would be lost
  const confirmSignOut = async () => {
    if (busy) return;
    const pending = unsyncedCount;
    if (pending === 0 || (await syncNow())) {
      signOut();
      return;
    }
    Alert.alert(
      'Unsynced changes',
      `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached your account yet. Signing out now deletes ${pending === 1 ? 'it' : 'them'} from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Try sync again', onPress: () => { manualSync(); } },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => { signOut(); } },
      ],
    );
  };

  const confirmDelete = async () => {
    if (busy) return;
    if (!deletePass) return;
    if (await deleteAccount(deletePass)) {
      setDeleting(false);
      setDeletePass('');
      router.replace('/');
    }
  };

  const closeDelete = () => {
    setDeleting(false);
    setDeletePass('');
    clearError();
  };

  const swap = () => {
    clearError();
    setNote(null);
    setConfirm('');
    setMode(m => (m === 'up' ? 'in' : 'up'));
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + space(1),
            paddingHorizontal: space(2),
            paddingBottom: insets.bottom + space(6),
            gap: space(2),
          }}
        >
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
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
            <Title>Account</Title>
          </View>

          <View style={{ alignItems: 'center', paddingVertical: space(1) }}>
            <Cat size={126} coat={t.coat} eye={t.eye} pattern={t.pattern} marks={t.marks} sleeping={!isGuest} />
          </View>

          {isGuest && !configured ? (
            <Card style={{ gap: space(1) }}>
              <Text style={{ color: t.text, fontSize: 15 }}>Sync unavailable</Text>
              <Muted>Your tasks are saved on this device.</Muted>
            </Card>
          ) : isGuest ? (
            <>
              {/* explain */}
              <Card style={{ gap: space(1) }}>
                <Text style={{ color: t.text, fontSize: 15 }}>
                  {mode === 'up' ? 'Create an account' : 'Sign in'}
                </Text>
                <Muted>
                  {mode === 'up'
                    ? `Your ${tasks.length} task${tasks.length === 1 ? '' : 's'} on this device move into the new account and sync everywhere.`
                    : 'Tasks on this device are added to the ones already on your account.'}
                </Muted>
              </Card>

              {/* form */}
              <Card style={{ gap: space(1.5) }}>
                <Field
                  value={mail}
                  onChangeText={setMail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!busy}
                />
                <Field
                  value={pass}
                  onChangeText={setPass}
                  placeholder="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'up' ? 'newPassword' : 'password'}
                  onSubmitEditing={mode === 'in' ? submit : undefined}
                  editable={!busy}
                />
                {mode === 'up' && (
                  <Field
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="password again"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    onSubmitEditing={submit}
                    editable={!busy}
                  />
                )}
                {mode === 'up' && (
                  <Muted style={{ fontSize: 11 }}>At least {MIN_PASSWORD} characters.</Muted>
                )}

                {(note || error) && (
                  <Text accessibilityLiveRegion="polite" style={{ color: DANGER, fontSize: 12 }}>
                    {note ?? error}
                  </Text>
                )}
                {notice && !note && !error && (
                  <Text accessibilityLiveRegion="polite" style={{ color: t.eye, fontSize: 12 }}>
                    {notice}
                  </Text>
                )}
                {unconfirmedEmail && (
                  <Pressable onPress={resendConfirmation} disabled={busy} style={{ paddingVertical: 4 }}>
                    <Text style={{ color: t.eye, fontSize: 12 }}>Resend confirmation email</Text>
                  </Pressable>
                )}

                <AccentButton
                  label={busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
                  onPress={submit}
                  disabled={busy}
                />

                <Pressable onPress={swap} disabled={busy} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Muted>
                    {mode === 'up' ? 'I already have an account' : 'I need an account'}
                  </Muted>
                </Pressable>
                {mode === 'in' && (
                  <Pressable onPress={forgot} disabled={busy} style={{ alignItems: 'center', paddingVertical: 6 }}>
                    <Muted>Forgot password?</Muted>
                  </Pressable>
                )}
              </Card>
            </>
          ) : (
            <>
              {/* signed in */}
              <Card style={{ gap: space(1) }}>
                <Muted>Signed in as</Muted>
                <Text style={{ color: t.eye, fontSize: 15 }}>{email}</Text>
                <Muted>
                  Your list is the same on every device you sign in on.
                </Muted>
              </Card>

              <Card style={{ gap: space(1) }}>
                <Text style={{ color: t.text, fontSize: 15 }}>Sync</Text>
                <Muted>{tasks.length} task{tasks.length === 1 ? '' : 's'} on this device</Muted>
                {lastSyncError ? (
                  <Text style={{ color: DANGER, fontSize: 12 }}>{lastSyncError}</Text>
                ) : (
                  <Muted style={{ fontSize: 12 }}>
                    {syncing ? 'Syncing…' : lastSyncedAt ? `Last synced ${ago(lastSyncedAt)}` : 'Not synced yet'}
                  </Muted>
                )}
                {unsyncedCount > 0 && !syncing && (
                  <Muted style={{ fontSize: 12 }}>
                    {unsyncedCount} change{unsyncedCount === 1 ? '' : 's'} waiting to sync
                  </Muted>
                )}
                <GhostButton
                  label={syncing ? 'Syncing…' : 'Sync now'}
                  onPress={manualSync}
                  disabled={syncing}
                />
              </Card>

              <GhostButton
                label={busy ? 'Signing out…' : 'Sign out'}
                onPress={confirmSignOut}
                disabled={busy}
              />
              <Muted style={{ textAlign: 'center' }}>
                Signing out clears this device and starts a new private list.
              </Muted>

              <Pressable
                onPress={() => { clearError(); setDeleting(true); }}
                disabled={busy}
                style={{ alignItems: 'center', paddingVertical: space(2) }}
              >
                <Text style={{ color: DANGER, fontSize: 13 }}>Delete account</Text>
              </Pressable>
            </>
          )}

          {__DEV__ && userId && (
            <Muted style={{ textAlign: 'center', fontSize: 10 }}>
              id {userId.slice(0, 8)}
            </Muted>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* delete - asks for the password again */}
      <Modal transparent animationType="fade" visible={deleting} onRequestClose={closeDelete}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: space(3) }}
        >
          <View style={{ backgroundColor: t.bg, padding: space(3), gap: space(2) }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Delete account?</Text>
            <Muted>
              This permanently deletes your account and every task synced to it. It cannot be undone.
              Type your password to confirm.
            </Muted>
            <Field
              value={deletePass}
              onChangeText={setDeletePass}
              placeholder="password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={confirmDelete}
              editable={!busy}
              autoFocus
            />
            {error && <Text style={{ color: DANGER, fontSize: 12 }}>{error}</Text>}
            <Pressable
              onPress={confirmDelete}
              disabled={busy || !deletePass}
              style={{
                backgroundColor: DANGER, paddingVertical: 15, alignItems: 'center',
                opacity: busy || !deletePass ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                {busy ? 'Deleting…' : 'Delete forever'}
              </Text>
            </Pressable>
            <GhostButton label="Cancel" onPress={closeDelete} disabled={busy} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
