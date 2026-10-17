import React, { useState } from 'react';
import { Modal, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useAuth, MIN_PASSWORD } from './auth';
import { useTheme, space } from './theme';
import { AccentButton, Field, Muted } from './ui';
import { Text } from './Txt';
import { DANGER } from './toast';

// reset - shown after opening a password-reset link
export function NewPasswordPrompt() {
  const t = useTheme();
  const { recovering, endRecovery, updatePassword, busy, error } = useAuth();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState<string | null>(null);

  if (!recovering) return null;

  const save = async () => {
    if (busy) return;
    if (pass.length < MIN_PASSWORD) {
      setNote(`Password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (pass !== confirm) {
      setNote('The two passwords do not match.');
      return;
    }
    setNote(null);
    if (await updatePassword(pass)) {
      setPass('');
      setConfirm('');
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={endRecovery}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
      >
        <View style={{ backgroundColor: t.bg, padding: space(3), paddingBottom: space(5), gap: space(2) }}>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>New password</Text>
          <Muted>You're signed in. Choose a new password for next time.</Muted>
          <Field
            value={pass}
            onChangeText={setPass}
            placeholder="new password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
          />
          <Field
            value={confirm}
            onChangeText={setConfirm}
            placeholder="new password again"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={save}
            editable={!busy}
          />
          {(note || error) && (
            <Text style={{ color: DANGER, fontSize: 12 }}>{note ?? error}</Text>
          )}
          <AccentButton label={busy ? 'Saving…' : 'Save password'} onPress={save} disabled={busy} />
          <Pressable onPress={endRecovery} disabled={busy} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Muted>Later</Muted>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
