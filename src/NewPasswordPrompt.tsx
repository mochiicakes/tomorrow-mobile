import React, { useState } from 'react';
import { Modal, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useAuth } from './auth';
import { useTheme, space } from './theme';
import { AccentButton, Field, Muted } from './ui';
import { Text } from './Txt';

// reset - shown after opening a password-reset link
export function NewPasswordPrompt() {
  const t = useTheme();
  const { recovering, endRecovery, updatePassword, busy, error } = useAuth();
  const [pass, setPass] = useState('');
  const [note, setNote] = useState<string | null>(null);

  if (!recovering) return null;

  const save = async () => {
    if (pass.length < 6) {
      setNote('Password needs at least 6 characters.');
      return;
    }
    setNote(null);
    if (await updatePassword(pass)) setPass('');
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={endRecovery}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            textContentType="newPassword"
            onSubmitEditing={save}
          />
          {(note || error) && (
            <Text style={{ color: '#D9534F', fontSize: 12 }}>{note ?? error}</Text>
          )}
          <AccentButton label={busy ? 'Saving…' : 'Save password'} onPress={save} />
          <Pressable onPress={endRecovery} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Muted>Later</Muted>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
