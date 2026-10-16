import React, { useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Screen, Title, Muted, Card, Field, AccentButton, GhostButton } from '../src/ui';
import { Text } from '../src/Txt';
import { Cat } from '../src/Cat';
import { useAuth } from '../src/auth';
import { useStore } from '../src/store';
import { useTheme, space } from '../src/theme';

export default function AccountScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const {
    userId, email, isGuest, configured, busy, error, notice,
    signUp, signIn, signOut, deleteAccount, sendPasswordReset, clearError,
  } = useAuth();
  const { tasks, syncing, syncNow } = useStore();

  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    setNote(null);
    if (!mail.includes('@')) {
      setNote('That does not look like an email address.');
      return;
    }
    if (pass.length < 6) {
      setNote('Password needs at least 6 characters.');
      return;
    }
    const ok = mode === 'up' ? await signUp(mail, pass) : await signIn(mail, pass);
    if (ok) {
      setMail('');
      setPass('');
      setNote(null);
    }
  };

  const forgot = async () => {
    setNote(null);
    if (!mail.includes('@')) {
      setNote('Type your email above first.');
      return;
    }
    await sendPasswordReset(mail);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and every task synced to it. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (await deleteAccount()) router.replace('/');
          },
        },
      ],
    );
  };

  const swap = () => {
    clearError();
    setNote(null);
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
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Field
                  value={pass}
                  onChangeText={setPass}
                  placeholder="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType="password"
                  onSubmitEditing={submit}
                />

                {(note || error) && (
                  <Text style={{ color: '#D9534F', fontSize: 12 }}>{note ?? error}</Text>
                )}
                {notice && !note && !error && (
                  <Text style={{ color: t.eye, fontSize: 12 }}>{notice}</Text>
                )}

                <AccentButton
                  label={busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
                  onPress={submit}
                />

                <Pressable onPress={swap} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Muted>
                    {mode === 'up' ? 'I already have an account' : 'I need an account'}
                  </Muted>
                </Pressable>
                {mode === 'in' && (
                  <Pressable onPress={forgot} style={{ alignItems: 'center', paddingVertical: 6 }}>
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
                <GhostButton
                  label={syncing ? 'Syncing…' : 'Sync now'}
                  onPress={syncNow}
                />
              </Card>

              <GhostButton
                label={busy ? 'Signing out…' : 'Sign out'}
                onPress={signOut}
              />
              <Muted style={{ textAlign: 'center' }}>
                Signing out clears this device and starts a new private list.
              </Muted>

              <Pressable onPress={confirmDelete} style={{ alignItems: 'center', paddingVertical: space(2) }}>
                <Text style={{ color: '#D9534F', fontSize: 13 }}>
                  {busy ? 'Working…' : 'Delete account'}
                </Text>
              </Pressable>
              {error && (
                <Text style={{ color: '#D9534F', fontSize: 12, textAlign: 'center' }}>{error}</Text>
              )}
            </>
          )}

          {__DEV__ && userId && (
            <Muted style={{ textAlign: 'center', fontSize: 10 }}>
              id {userId.slice(0, 8)}
            </Muted>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
