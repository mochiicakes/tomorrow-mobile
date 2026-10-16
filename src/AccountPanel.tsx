import React from 'react';
import { router } from 'expo-router';
import { Text } from './Txt';
import { useAuth } from './auth';
import { useTheme, space } from './theme';
import { Card, Muted, AccentButton, GhostButton } from './ui';

// panel
export function AccountPanel() {
  const t = useTheme();
  const { email, isGuest, configured } = useAuth();

  return (
    <Card style={{ gap: space(1.5) }}>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>Account</Text>

      {isGuest && !configured ? (
        <Muted>Sync unavailable. Your tasks are saved on this device.</Muted>
      ) : isGuest ? (
        <>
          <Muted>Your tasks are saved on this device. Sign in to sync them across devices.</Muted>
          <AccentButton
            label="Sign in / create account"
            onPress={() => router.push('/account')}
          />
        </>
      ) : (
        <>
          <Muted>Signed in as</Muted>
          <Text style={{ color: t.eye, fontSize: 14 }}>{email}</Text>
          <GhostButton label="Manage account" onPress={() => router.push('/account')} />
        </>
      )}
    </Card>
  );
}
